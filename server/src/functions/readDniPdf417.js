// Decodifica el código PDF417 del DNI argentino usando `zbarimg` (zbar completo,
// que SÍ soporta PDF417, a diferencia de los builds wasm que lo excluyen).
// 100% offline, corre en el servidor Ubuntu air-gapped.
// Recibe { file_url } (subida previa vía UploadFile) y devuelve:
//   { ok: true, raw, parsed } | { ok: false, error }.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveLocalPath } from './_ocr.js';
import { parsePdf417 } from './_pdf417Parse.js';

const execFileAsync = promisify(execFile);

let _hasZbar;
async function hasZbar() {
  if (_hasZbar === undefined) {
    try { await execFileAsync('zbarimg', ['--version'], { timeout: 5000 }); _hasZbar = true; }
    catch (e) { _hasZbar = e.code !== 'ENOENT'; } // --version puede salir !=0 en algunos builds; sólo ENOENT indica ausencia
  }
  return _hasZbar;
}

// `zbarimg --raw -q` emite el payload crudo (sin "PDF-417:"). Devuelve '' si no
// encontró código (zbarimg sale con código != 0 en ese caso, lo tratamos como no-decode).
async function runZbar(filePath) {
  try {
    const { stdout } = await execFileAsync('zbarimg', ['--raw', '-q', filePath], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    return (stdout || '').trim();
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('El binario `zbarimg` no está instalado en el servidor. Ejecutá: sudo apt-get install -y zbar-tools');
    return '';
  }
}

export async function readDniPdf417({ file_url } = {}) {
  const filePath = resolveLocalPath(file_url);

  if (!(await hasZbar())) {
    return { ok: false, error: 'zbarimg no está instalado en el servidor. Instalalo con: sudo apt-get install -y zbar-tools' };
  }

  let raw = await runZbar(filePath);

  // Si no decodeó, preprocesar la imagen (grises + 2x) con ImageMagick y reintentar.
  // Ayuda con fotos de cámara donde el código PDF417 ocupa una franja chica.
  if (!raw) {
    let out = '';
    try {
      const os = await import('node:os');
      out = path.join(os.tmpdir(), `ae-pdf417-${Date.now()}.png`);
      await execFileAsync('convert', [filePath, '-colorspace', 'Gray', '-resize', '200%', '-normalize', '-sharpen', '0x1', out], { timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
      raw = await runZbar(out);
    } catch {} finally { if (out) { try { fs.unlinkSync(out); } catch {} }
    }
  }

  if (!raw) return { ok: false, error: 'No se encontró un código PDF417 en la imagen. Usá una foto nítida del DNI con el código de barras 2D visible.' };

  const parsed = parsePdf417(raw);
  if (!parsed || !parsed.dni) return { ok: false, error: 'Se decodificó un código pero no se reconocieron los datos del DNI.', raw };
  return { ok: true, raw, parsed };
}