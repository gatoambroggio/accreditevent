// OCR de DNI argentino. Dos caminos (sin GPU, sin Ollama):
// 1) PaddleOCR — motor de OCR dedicado (PP-OCRv4, español). Lee EXACTAMENTE lo
//    impreso, no alucina como los VLM. Corre en CPU en 1-3s. Principal.
// 2) Tesseract mejorado — preprocesado con ImageMagick, multi-PSM, mejor score.
//    Único fallback. El resultado es editable en el modal, así que la heurística
//    imperfecta alcanza: el usuario corrige lo que haga falta.

import fs from 'node:fs';
import { resolveLocalPath, runTesseract, preprocessForOcr } from './_ocr.js';
// PaddleOCR se importa de forma DINÁMICA: si el archivo falta o python no está
// instalado, el servidor igual arranca y readDni cae a Tesseract. Nunca un
// motor opcional debe poder tirar abajo el arranque del servidor.
let _paddleMod = null; // null = sin probar | module | false = no disponible
async function getPaddle() {
  if (_paddleMod === false) return null;
  if (_paddleMod) return _paddleMod;
  try { _paddleMod = await import('./_paddleOcr.js'); return _paddleMod; }
  catch (e) { console.warn('[readDni] PaddleOCR no disponible:', e.message); _paddleMod = false; return null; }
}

// ── Camino 1: PaddleOCR (OCR dedicado, preciso en CPU) ──────────────────────
// Motor de OCR real (no VLM): lee lo impreso sin alucinar. Reutiliza la misma
// heurística de extractFromText que Tesseract, así no duplica lógica de parsing.
async function readDniWithPaddle(filePath, mod) {
  const lines = await mod.paddleOcr(filePath);
  const text = lines.map((l) => l.text).join('\n');
  const r = extractFromText(text);
  r.raw_text = `[paddle] ${text.slice(0, 500)}`;
  return r;
}

// ── Camino 2: Tesseract local (offline) ─────────────────────────────────────
const LABEL_EXACT = /^(apellido|nombre|nombres|documento|dni|cuil|cuit|domicilio|fecha\s*de\s*nacimiento|sexo|lugar\s*de\s*nacimiento|provincia|nacionalidad|estado\s*civil|expira|vencimiento|entidad|nacionalidad|de\s+apellido|de\s+nombre)$/i;
const DECORATION = /(republica\s+argentina|meridiano|estado\s+plurinacional|nacionalidad\s+argentina|guia|identidad|documento\s+nacional|«|»|^\s*\W+\s*$)/i;

function normalizeName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-ZÑ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findValueAfterLabel(lines, labelRe) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    const rest = lines[i].slice(m[0].length).replace(/^[:.\s]+/, '').trim();
    if (rest && !LABEL_EXACT.test(rest) && !DECORATION.test(rest)) return rest;
    for (let j = i + 1; j < lines.length; j++) {
      const v = lines[j];
      if (LABEL_EXACT.test(v) || DECORATION.test(v)) continue;
      if (v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/g, '').length < 3) continue;
      return v;
    }
  }
  return '';
}

function extractFromText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let dni = '';
  const dniLabel = /^(dni|documento|cuil|cuit)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (!dniLabel.test(lines[i])) continue;
    const same = lines[i].match(/\d[\d.]{6,9}\d/);
    if (same) { dni = same[0].replace(/\D/g, ''); break; }
    const next = lines[i + 1] || '';
    const nm = next.match(/\d[\d.]{6,9}\d/);
    if (nm) { dni = nm[0].replace(/\D/g, ''); break; }
  }
  if (!dni || dni.length < 7 || dni.length > 8) {
    for (const l of lines) {
      const m = l.match(/(\d[\d.]{6,9}\d)/);
      if (m) { const d = m[1].replace(/\D/g, ''); if (d.length >= 7 && d.length <= 8) { dni = d; break; } }
    }
  }
  if (!dni) { const m = text.match(/\b(\d{7,8})\b/); if (m) dni = m[1]; }

  let apellido = normalizeName(findValueAfterLabel(lines, /^apellido\b/i));
  let nombre = normalizeName(findValueAfterLabel(lines, /^nombre(s)?\b/i));
  if (!apellido && !nombre) {
    const nameLines = lines.filter((l) => {
      if (LABEL_EXACT.test(l) || DECORATION.test(l)) return false;
      const letters = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
      return letters.length >= 3 && !/\d{3,}/.test(l);
    });
    apellido = normalizeName(nameLines[0] || '');
    nombre = normalizeName(nameLines[1] || '');
  }
  return { nombre, apellido, dni, raw_text: text.slice(0, 500) };
}

function scoreResult(r) {
  let s = 0;
  if (r.dni && r.dni.length >= 7 && r.dni.length <= 8) s += 4;
  if (r.apellido && r.apellido.length >= 3) s += 2;
  if (r.nombre && r.nombre.length >= 3) s += 2;
  return s;
}

async function readDniWithTesseract(filePath) {
  // Candidatos: imagen original + imagen preprocesada (grises/upscale/sharpen).
  const candidates = [filePath];
  let pre = filePath;
  try { pre = await preprocessForOcr(filePath); } catch {}
  if (pre && pre !== filePath && fs.existsSync(pre)) candidates.push(pre);

  let best = { nombre: '', apellido: '', dni: '', raw_text: '' };
  for (const cand of candidates) {
    for (const psm of [6, 4, 3]) {
      let text = '';
      try { text = await runTesseract(cand, { psm }); } catch {}
      if (!text || !text.trim()) continue;
      const r = extractFromText(text);
      if (scoreResult(r) > scoreResult(best)) best = r;
    }
  }
  // Limpieza del preprocesado temporal.
  if (pre !== filePath) { try { fs.unlinkSync(pre); } catch {} }
  return best;
}

export async function readDni({ file_url } = {}) {
  const filePath = resolveLocalPath(file_url);

  // 1. PaddleOCR — motor de OCR dedicado (preciso en CPU, no alucina). Principal.
  // Import dinámico: si el módulo no existe, getPaddle() devuelve null y seguimos.
  const paddle = await getPaddle();
  if (paddle && await paddle.paddleAvailable()) {
    try {
      const r = await readDniWithPaddle(filePath, paddle);
      if (r && (r.dni || r.nombre || r.apellido)) return r;
    } catch (e) {
      console.warn('[readDni] paddle falló, siguiente camino:', e.message);
    }
  }

  // 2. Tesseract local — único fallback (sin GPU, sin Ollama). Siempre devuelve.
  return readDniWithTesseract(filePath);
}