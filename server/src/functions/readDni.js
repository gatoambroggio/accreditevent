// OCR de DNI argentino. Tres caminos:
// 1) Visión (LLM multimodal vía API, OpenAI-compatible) — calidad de nube sobre
//    fotos de cámara. Se usa si hay api_key en SystemSetting.vision_ocr. Principal.
// 2) PaddleOCR — motor de OCR dedicado (PP-OCRv4, español). Lee lo impreso sin
//    alucinar. Corre en CPU en 1-3s. Respaldo si no hay visión.
// 3) Tesseract mejorado — preprocesado con ImageMagick, multi-PSM, mejor score.
//    Último fallback. El resultado es editable en el modal, así que la heurística
//    imperfecta alcanza: el usuario corrige lo que haga falta.

import fs from 'node:fs';
import { resolveLocalPath, runTesseract, preprocessForOcr } from './_ocr.js';
import { visionExtract, visionAvailable } from './_visionOcr.js';
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

// ── Camino 1: Visión (LLM multimodal vía API) ───────────────────────────────
// Reutiliza _visionOcr (mismo módulo que readPatente): lee SystemSetting.vision_ocr
// (api_key/base_url/model), cachea la config, hace probe de alcanzabilidad y
// limpia fences de markdown. Si no hay api_key o el endpoint no se alcanza,
// visionAvailable() devuelve false y readDni cae a PaddleOCR/Tesseract.
async function readDniWithVision(filePath) {
  const prompt = `Leé los datos del DNI argentino visible en la imagen.
Extraé apellido, nombre y número de documento.
Devolvé EXACTAMENTE un JSON: {"nombre":"","apellido":"","dni":""}.
- nombre y apellido en MAYÚSCULAS, sin puntos ni comas.
- dni: solo los 7 u 8 dígitos del número de documento, sin puntos ni guiones.
- Si un dato no se lee con seguridad, devolvé string vacío para esa clave. No inventes ni completes.
- No incluyas texto fuera del JSON.`;
  const content = await visionExtract(filePath, {
    prompt,
    jsonSchema: { properties: { nombre: {}, apellido: {}, dni: {} } },
  });
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { return null; }
  const nombre = normalizeName(parsed.nombre || '');
  const apellido = normalizeName(parsed.apellido || '');
  const dni = String(parsed.dni || '').replace(/\D/g, '');
  // Validar DNI: exactamente 7 u 8 dígitos.
  if (dni.length !== 7 && dni.length !== 8) return null;
  return { nombre, apellido, dni, raw_text: `[vision] ${content.slice(0, 200)}` };
}

// ── Camino 2: PaddleOCR (OCR dedicado, preciso en CPU) ──────────────────────
// Motor de OCR real (no VLM): lee lo impreso sin alucinar. Reutiliza la misma
// heurística de extractFromText que Tesseract, así no duplica lógica de parsing.
async function readDniWithPaddle(filePath, mod) {
  const lines = await mod.paddleOcr(filePath);
  const text = lines.map((l) => l.text).join('\n');
  const r = extractFromText(text);
  r.raw_text = `[paddle] ${text.slice(0, 500)}`;
  return r;
}

// ── Camino 3: Tesseract local (offline) ─────────────────────────────────────
// Etiquetas impresas del DNI (español + inglés) que NO son datos: se rechazan
// como valores para que el OCR nunca devuelva "SURNAME"/"NAME"/"ARGENTINA" etc.
const LABEL_EXACT = /^(apellido|surname|nombre|nombres|name|given\s*name|documento|document|document\s*number|dni|id|cuil|cuit|domicilio|fecha\s*de\s*nacimiento|birth|place\s*of\s*birth|sexo|sex|lugar\s*de\s*nacimiento|provincia|nacionalidad|nationality|estado\s*civil|expira|vencimiento|entidad|de\s+apellido|de\s+nombre|argentina|republic)$/i;
const DECORATION = /(republica\s+argentina|republic|meridiano|estado\s+plurinacional|nacionalidad\s+argentina|nationality|guia|identidad|documento\s+nacional|argentina|«|»|^\s*\W+\s*$)/i;

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
  // Recolectar todos los runs largos de dígitos del texto crudo para detectar
  // candidatos truncados: un DNI válido de 7-8 dígitos no puede ser substring
  // de un run más largo que aparece en el texto (ej. "1234567" de "12345678901").
  const allDigits = (text.match(/\d[\d.\s]{5,12}\d/g) || [])
    .map((s) => s.replace(/\D/g, ''))
    .filter((s) => s.length >= 7);
  const isTruncated = (d) => allDigits.some((big) => big !== d && big.includes(d));

  let dni = '';
  const dniLabel = /^(dni|documento|cuil|cuit|id|document)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (!dniLabel.test(lines[i])) continue;
    const same = lines[i].match(/\d[\d.]{6,9}\d/);
    if (same) { const d = same[0].replace(/\D/g, ''); if ((d.length === 7 || d.length === 8) && !isTruncated(d)) { dni = d; break; } }
    const next = lines[i + 1] || '';
    const nm = next.match(/\d[\d.]{6,9}\d/);
    if (nm) { const d = nm[0].replace(/\D/g, ''); if ((d.length === 7 || d.length === 8) && !isTruncated(d)) { dni = d; break; } }
  }
  if (!dni) {
    for (const l of lines) {
      const m = l.match(/(\d[\d.]{6,9}\d)/);
      if (!m) continue;
      const d = m[1].replace(/\D/g, '');
      if ((d.length === 7 || d.length === 8) && !isTruncated(d)) { dni = d; break; }
    }
  }
  if (!dni) {
    const m = text.match(/\b(\d{7,8})\b/);
    if (m) { const d = m[1]; if (!isTruncated(d)) dni = d; }
  }

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

  // 1. Visión (LLM multimodal) — calidad de nube. Solo si hay api_key en
  // SystemSetting.vision_ocr y el endpoint es alcanzable. Si no, se saltea.
  if (await visionAvailable()) {
    try {
      const r = await readDniWithVision(filePath);
      if (r && (r.dni || r.nombre || r.apellido)) return r;
    } catch (e) {
      console.warn('[readDni] visión falló, siguiente camino:', e.message);
    }
  }

  // 2. PaddleOCR — motor de OCR dedicado (preciso en CPU, no alucina). Respaldo.
  const paddle = await getPaddle();
  if (paddle && await paddle.paddleAvailable()) {
    try {
      const r = await readDniWithPaddle(filePath, paddle);
      if (r && (r.dni || r.nombre || r.apellido)) return r;
    } catch (e) {
      console.warn('[readDni] paddle falló, siguiente camino:', e.message);
    }
  }

  // 3. Tesseract local — último fallback. Siempre devuelve.
  return readDniWithTesseract(filePath);
}