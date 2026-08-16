// Helpers de OCR locales usando el binario `tesseract` del sistema (instalado
// por apt en install.sh: tesseract-ocr + tesseract-ocr-spa). 100% offline,
// sin descargas de traineddata ni WASM (a diferencia de tesseract.js, que
// necesita internet al primer uso y por eso falla en air-gapped).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

// Resuelve un input (path local o file_url del servidor local) a un path de
// archivo existente en disco.
export function resolveLocalPath(input) {
  if (!input) throw new Error('No se recibió imagen.');
  let filePath = input;
  if (typeof input === 'string' && /^https?:\/\//.test(input)) {
    let pathname = input;
    try { pathname = new URL(input).pathname; } catch {}
    if (pathname.startsWith('/uploads/')) {
      filePath = path.join(env.uploadDir, path.basename(pathname));
    } else {
      const rel = input.replace(env.lanBaseUrl, '');
      const cand = path.resolve(rel.replace(/^\//, ''));
      filePath = fs.existsSync(cand) ? cand : path.join(env.uploadDir, path.basename(pathname || rel));
    }
  }
  if (!fs.existsSync(filePath)) throw new Error(`Imagen no encontrada: ${filePath}`);
  return filePath;
}

// Ejecuta `tesseract <image> stdout -l <lang> --psm <psm>` y devuelve el texto.
export async function runTesseract(filePath, { psm = 6, lang = 'spa', whitelist } = {}) {
  const args = [filePath, 'stdout', '-l', lang, '--psm', String(psm)];
  if (whitelist) args.push('-c', `tessedit_char_whitelist=${whitelist}`);
  try {
    const { stdout } = await execFileAsync('tesseract', args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    return stdout || '';
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('El binario `tesseract` no está instalado en el servidor. Ejecutá: sudo apt-get install -y tesseract-ocr tesseract-ocr-spa');
    }
    throw new Error(`OCR falló: ${e.message}`);
  }
}