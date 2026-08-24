// Decodifica el código PDF417 del DNI argentino.
// Motor principal: zxing-cpp (C++) vía python3 — significativamente más potente
// que zbar para PDF417 en fotos borrosas/inclinadas/baja luz. Respaldo: ImageMagick
// (contraste + threshold 50%) + zbarimg. 100% offline, servidor Ubuntu air-gapped.
// Recibe { file_url } (subida previa vía UploadFile) y devuelve:
//   { ok: true, raw, parsed } | { ok: false, error }.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveLocalPath } from './_ocr.js';
import { parsePdf417 } from './_pdf417Parse.js';

const execFileAsync = promisify(execFile);

let _hasZxing, _hasZbar;
async function hasZxingCpp() {
  if (_hasZxing === undefined) {
    try {
      const { stdout } = await execFileAsync('python3', ['-c', 'import zxingcpp; print("ok")'], { timeout: 8000 });
      _hasZxing = /ok/.test(stdout || '');
    } catch { _hasZxing = false; }
  }
  return _hasZxing;
}
async function hasZbar() {
  if (_hasZbar === undefined) {
    try { await execFileAsync('zbarimg', ['--version'], { timeout: 5000 }); _hasZbar = true; }
    catch (e) { _hasZbar = e.code !== 'ENOENT'; } // --version puede salir !=0 en algunos builds; sólo ENOENT indica ausencia
  }
  return _hasZbar;
}

// zxing-cpp (C++) vía python3: el motor más potente para PDF417 en fotos difíciles.
// Devuelve el texto del primer código encontrado, o '' si no decodeó.
async function runZxingCpp(filePath) {
  const script = `import cv2,zxingcpp\ntry:\n img=cv2.imread(r"${filePath}")\n rs=list(zxingcpp.read_barcodes(img))\n print(rs[0].text if rs else "")\nexcept Exception:\n print("")`;
  try {
    const { stdout } = await execFileAsync('python3', ['-c', script], { timeout: 25000, maxBuffer: 2 * 1024 * 1024 });
    return (stdout || '').trim();
  } catch { return ''; }
}

// `zbarimg --raw -q` emite el payload crudo (sin "PDF-417:"). '' si no encontró.
async function runZbar(filePath) {
  try {
    const { stdout } = await execFileAsync('zbarimg', ['--raw', '-q', filePath], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    return (stdout || '').trim();
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('zbarimg no instalado');
    return '';
  }
}

// Limpia la imagen con ImageMagick: contraste + threshold 50% (binariza a B/N puro).
// Es el preprocesamiento que más ayuda a los lectores de PDF417 con fotos difíciles.
async function cleanImage(filePath) {
  const out = path.join(os.tmpdir(), `ae-pdf417-${Date.now()}.png`);
  await execFileAsync('convert', [filePath, '-contrast', '-threshold', '50%', out], { timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
  return out;
}

export async function readDniPdf417({ file_url } = {}) {
  const filePath = resolveLocalPath(file_url);
  const haveZxing = await hasZxingCpp();
  const haveZbarBin = await hasZbar();
  if (!haveZxing && !haveZbarBin) {
    return { ok: false, error: 'Faltan motores de decodificación en el servidor. Instalá: pip install zxing-cpp opencv-python  y/o  sudo apt-get install -y zbar-tools' };
  }

  let raw = '';
  // 1) zxing-cpp sobre la imagen original (motor principal, más potente para PDF417).
  if (haveZxing) raw = await runZxingCpp(filePath);

  // 2) Si falla, limpiar la imagen (contraste + threshold 50%) y reintentar zxing-cpp
  //    y, si tampoco, zbarimg sobre la imagen limpia.
  let cleaned = '';
  if (!raw) {
    try { cleaned = await cleanImage(filePath); } catch {}
    if (cleaned && haveZxing) raw = await runZxingCpp(cleaned);
    if (!raw && cleaned && haveZbarBin) raw = await runZbar(cleaned);
  }

  // 3) Respaldo final: zbarimg directo sobre la original, y luego grises+2x+sharpen.
  if (!raw && haveZbarBin) {
    raw = await runZbar(filePath);
    if (!raw) {
      let proc = '';
      try {
        proc = path.join(os.tmpdir(), `ae-pdf417-${Date.now()}.png`);
        await execFileAsync('convert', [filePath, '-colorspace', 'Gray', '-resize', '200%', '-normalize', '-sharpen', '0x1', proc], { timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
        raw = await runZbar(proc);
      } catch {} finally { if (proc) { try { fs.unlinkSync(proc); } catch {} } }
    }
  }

  if (cleaned) { try { fs.unlinkSync(cleaned); } catch {} }

  if (!raw) return { ok: false, error: 'No se encontró un código PDF417 en la imagen. Usá una foto nítida del DNI con el código de barras 2D visible.' };

  const parsed = parsePdf417(raw);
  if (!parsed || !parsed.dni) return { ok: false, error: 'Se decodificó un código pero no se reconocieron los datos del DNI.', raw };
  return { ok: true, raw, parsed };
}