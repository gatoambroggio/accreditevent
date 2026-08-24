// Wrapper de PaddleOCR (Python). Motor de OCR DEDICADO: lee exactamente lo
// impreso en el DNI, sin alucinar como los VLM (moondream). Corre en CPU.
// readDni lo usa como camino principal; vision y Tesseract quedan de respaldo.
// Se carga de forma DINÁMICA desde readDni.js, así que si este archivo o python
// faltan, el servidor igual arranca y cae a los otros caminos.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY = path.join(__dirname, '_paddleOcr.py');

let _avail = null;

// ¿PaddleOCR está instalado? Cacheado: el import test tarda ~1s la 1ra vez.
export async function paddleAvailable() {
  if (_avail !== null) return _avail;
  try {
    const { stdout } = await exec('python3', [PY, '--check'], { timeout: 20000 });
    _avail = stdout.trim() === 'OK';
  } catch {
    _avail = false;
  }
  return _avail;
}

export function invalidatePaddleCache() { _avail = null; }

// Devuelve [{text, conf}, ...]. Lanza si falla — el caller hace fallback.
// 60s da margen: en CPU la 1ra inference carga modelos (~5-10s), luego 1-3s.
export async function paddleOcr(filePath, { timeoutMs = 60000 } = {}) {
  const { stdout } = await exec('python3', [PY, filePath], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(stdout.trim());
  if (data.error) throw new Error(`PaddleOCR: ${data.error}`);
  return data.lines || [];
}