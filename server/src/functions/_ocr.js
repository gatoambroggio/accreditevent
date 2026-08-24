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
  if (typeof input === 'string' && input.startsWith('/uploads/')) {
    filePath = path.join(env.uploadDir, path.basename(input));
  } else if (typeof input === 'string' && /^https?:\/\//.test(input)) {
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

// Detecta los idiomas de tesseract disponibles (caché). Si falta el español
// (tesseract-ocr-spa no instalado — común en air-gapped sin acceso al repo),
// cae a inglés para que el OCR igual funcione (menor calidad, pero lee
// dígitos y letras). Para patentes (alfanumérico) el inglés alcanza perfecto.
let _tessLangs = null;
async function tesseractLangs() {
  if (_tessLangs !== null) return _tessLangs;
  try {
    const { stdout } = await execFileAsync('tesseract', ['--list-langs'], { timeout: 10000, maxBuffer: 1024 * 1024 });
    _tessLangs = stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/^list/i.test(l));
  } catch { _tessLangs = []; }
  return _tessLangs;
}

async function resolveTessLang(requested) {
  const langs = await tesseractLangs();
  if (langs.length === 0) return requested || env.tesseractLang || 'spa';
  const want = requested || env.tesseractLang || 'spa';
  if (langs.includes(want)) return want;
  if (langs.includes('eng')) return 'eng';
  return langs[0];
}

// Ejecuta `tesseract <image> stdout -l <lang> --psm <psm>` y devuelve el texto.
export async function runTesseract(filePath, { psm = 6, lang, whitelist } = {}) {
  const resolvedLang = await resolveTessLang(lang);
  const args = [filePath, 'stdout', '-l', resolvedLang, '--psm', String(psm)];
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

// ── Soporte de PDF ──────────────────────────────────────────────────────────
// `tesseract` no lee PDFs directamente: hay que rasterizar las páginas a PNG
// con `pdftoppm` (poppler-utils). Si no está instalado o el archivo no es PDF,
// cae a pasar el archivo tal cual a tesseract (que fallará con un mensaje claro
// si es PDF sin poppler — el install.sh instala poppler-utils para evitarlo).
function isPdf(filePath) {
  return /\.pdf$/i.test(filePath);
}

// Convierte un PDF a una lista de PNGs temporales (una por página, 200 DPI).
// Devuelve [] si pdftoppm no está disponible (el caller decide qué hacer).
async function pdfToImages(filePath) {
  const os = await import('node:os');
  const prefix = path.join(os.tmpdir(), `ae-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    await execFileAsync('pdftoppm', ['-png', '-r', '200', filePath, prefix], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('El binario `pdftoppm` no está instalado (requerido para leer PDFs). Ejecutá: sudo apt-get install -y poppler-utils');
    }
    throw new Error(`PDF→imagen falló: ${e.message}`);
  }
  // pdftoppm nombra los archivos como prefix-1.png, prefix-2.png, ... (o prefix-01.png)
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(base) && /\.png$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '').slice(-6), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, '').slice(-6), 10) || 0;
      return na - nb;
    })
    .map((f) => path.join(dir, f));
  return files;
}

// OCR de un documento completo (póliza, ART, etc.). A diferencia de runTesseract
// (pensado para patentes/DNI con PSM 6), usa PSM 3 (auto, página completa) y
// soporta PDFs multipágina concatenando el texto de cada página. Sin whitelist
// (necesita letras, números, símbolos, acentos). 100% offline.
export async function ocrDocument(filePath, { psm = 3, lang = 'spa' } = {}) {
  const resolved = resolveLocalPath(filePath);

  if (!isPdf(resolved)) {
    return runTesseract(resolved, { psm, lang });
  }

  // PDF: rasterizar cada página y concatenar el OCR.
  const pages = await pdfToImages(resolved);
  if (pages.length === 0) throw new Error('El PDF no tiene páginas o no se pudo rasterizar.');
  const chunks = [];
  for (const page of pages) {
    try {
      chunks.push(await runTesseract(page, { psm, lang }));
    } catch (e) {
      // Si una página falla, seguimos con las demás (mejor texto parcial que nada).
      console.warn(`[ocrDocument] página falló: ${e.message}`);
    } finally {
      try { fs.unlinkSync(page); } catch {}
    }
  }
  return chunks.join('\n\n');
}

// ── Preprocesado de imagen para OCR ──────────────────────────────────────────
// Usa ImageMagick (`convert`) si está disponible: pasa a grises, escala 2x,
// normaliza el contraste, despeckle y sharpen. Mejora mucho la precisión de
// Tesseract sobre fotos de cámara de DNIs. Si convert no existe, devuelve el
// archivo original (Tesseract igual corre, con menor calidad).
let _hasConvert;
async function hasConvert() {
  if (_hasConvert === undefined) {
    try { await execFileAsync('convert', ['-version'], { timeout: 5000 }); _hasConvert = true; }
    catch { _hasConvert = false; }
  }
  return _hasConvert;
}

export async function preprocessForOcr(filePath) {
  if (!(await hasConvert())) return filePath;
  const os = await import('node:os');
  const out = path.join(os.tmpdir(), `ae-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  try {
    await execFileAsync('convert', [
      filePath, '-colorspace', 'Gray', '-resize', '200%',
      '-normalize', '-despeckle', '-sharpen', '0x1', out,
    ], { timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
    return out;
  } catch {
    try { fs.unlinkSync(out); } catch {}
    return filePath;
  }
}