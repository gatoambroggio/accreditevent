// Lectura de patentes argentina.
// 1) Si hay VISION_API_KEY: usa un LLM de visión (igual que Base44 cloud con
//    InvokeLLM) — máxima calidad sobre fotos de cámara.
// 2) Si no: cae a Tesseract local (offline, menor calidad pero sin dependencias).
// Devuelve la patente normalizada + validada con formato argentino.

import { resolveLocalPath, runTesseract } from './_ocr.js';
import { visionExtract, visionAvailable } from './_visionOcr.js';

// ── Formatos válidos de patente argentina (sin espacios) ────────────────────
const MERCOSUR_AUTO = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const ANTIGUO_AUTO  = /^[A-Z]{3}\d{3}$/;
const MOTO_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]$/;
const MOTO_ANTIGUA  = /^[A-Z]\d{3}[A-Z]{3}$/;

const PLATE_RE = /([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{2}\d{3}[A-Z]|[A-Z]{3}\d{3}|[A-Z]\d{3}[A-Z]{3}|\d{3}[A-Z]{2}\d{2})/g;

function normalize(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Corrección de confusiones típicas de OCR (O↔0, I↔1, S↔5, B↔8, Z↔2) en las
// posiciones donde el formato exige letra o dígito. Solo se aplica a candidatos
// con longitud plausible (6-7) y devuelve la versión corregida solo si valida,
// así no genera falsos positivos: el resultado final siempre pasa validarPatente.
const LETTER_FIX = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '4': 'A', '6': 'G' };
const DIGIT_FIX = { 'O': '0', 'I': '1', 'S': '5', 'B': '8', 'Z': '2', 'A': '4', 'G': '6', 'D': '0' };

function fixPlateForFormat(c, fmt) {
  const chars = c.split('');
  // mercosur_auto: posiciones 0,1,5,6 = letras; 2,3,4 = dígitos
  if (fmt === 'mercosur_auto' && c.length === 7) {
    [0, 1, 5, 6].forEach((i) => { if (/[0-9]/.test(chars[i])) chars[i] = LETTER_FIX[chars[i]] || chars[i]; });
    [2, 3, 4].forEach((i) => { if (/[A-Z]/.test(chars[i])) chars[i] = DIGIT_FIX[chars[i]] || chars[i]; });
  }
  // antiguo_auto: 0,1,2 = letras; 3,4,5 = dígitos
  else if (fmt === 'antiguo_auto' && c.length === 6) {
    [0, 1, 2].forEach((i) => { if (/[0-9]/.test(chars[i])) chars[i] = LETTER_FIX[chars[i]] || chars[i]; });
    [3, 4, 5].forEach((i) => { if (/[A-Z]/.test(chars[i])) chars[i] = DIGIT_FIX[chars[i]] || chars[i]; });
  }
  // mercosur_moto: 0,1 = letras; 2,3,4 = dígitos; 6 = letra
  else if (fmt === 'mercosur_moto' && c.length === 6) {
    [0, 1, 5].forEach((i) => { if (/[0-9]/.test(chars[i])) chars[i] = LETTER_FIX[chars[i]] || chars[i]; });
    [2, 3, 4].forEach((i) => { if (/[A-Z]/.test(chars[i])) chars[i] = DIGIT_FIX[chars[i]] || chars[i]; });
  }
  return chars.join('');
}

// Intenta corregir un candidato a un formato válido. Devuelve la patente
// corregida+validada, o null si no se puede arreglar.
function tryFixPlate(c) {
  if (!c) return null;
  for (const fmt of ['mercosur_auto', 'antiguo_auto', 'mercosur_moto']) {
    const fixed = fixPlateForFormat(c, fmt);
    if (fixed !== c) {
      const v = validarPatente(fixed);
      if (v.valido) return { patente: fixed, ...v };
    }
  }
  return null;
}

function validarPatente(p) {
  if (!p) return { valido: false, formato: 'desconocido', descripcion: 'Sin patente' };
  if (MERCOSUR_AUTO.test(p)) return { valido: true, formato: 'mercosur_auto', descripcion: 'Auto Mercosur (2 letras · 3 números · 2 letras)' };
  if (ANTIGUO_AUTO.test(p))  return { valido: true, formato: 'antiguo_auto',  descripcion: 'Auto antiguo (3 letras · 3 números)' };
  if (MOTO_MERCOSUR.test(p)) return { valido: true, formato: 'mercosur_moto', descripcion: 'Moto Mercosur (2 letras · 3 números · 1 letra)' };
  if (MOTO_ANTIGUA.test(p))  return { valido: true, formato: 'antiguo_moto',  descripcion: 'Moto antigua' };
  return { valido: false, formato: 'desconocido', descripcion: 'Formato no reconocido como patente argentina' };
}

// ── Camino 1: LLM de visión ─────────────────────────────────────────────────
async function recognizeWithVision(filePath) {
  const prompt = `Leé la patente (dominio) visible en la imagen. Es una patente argentina.
Formatos válidos: AA999AA (auto Mercosur), AAA999 (auto antiguo), AA999A (moto).
Devolvé un JSON: {"patente":"AB123CD","formato":"mercosur_auto","confianza":0.9}.
- patente en MAYÚSCULAS sin espacios ni guiones.
- formato uno de: mercosur_auto, antiguo_auto, mercosur_moto, antiguo_moto, desconocido.
- Si no hay patente legible, devolvé {"patente":"","formato":"desconocido","confianza":0}.`;
  const content = await visionExtract(filePath, { prompt, jsonSchema: { properties: { patente: {}, formato: {}, confianza: {} } } });
  // Extraer el JSON del contenido (puede venir con fences de markdown).
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { return null; }
  const patente = normalize(parsed.patente);
  const v = validarPatente(patente);
  return {
    patente,
    valido: v.valido,
    descripcion: v.descripcion,
    confianza: Number(parsed.confianza) || 0,
    formato_detectado: parsed.formato || v.formato,
    raw_text: `[vision] ${content.slice(0, 200)}`,
  };
}

// ── Camino 2: Tesseract local (offline) ─────────────────────────────────────
async function recognizeWithTesseract(filePath) {
  const PSMS = [7, 8, 13, 6];
  let rawAll = '';
  for (const psm of PSMS) {
    let text;
    try {
      text = await runTesseract(filePath, { psm, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
    } catch {
      continue;
    }
    rawAll += (rawAll ? '\n' : '') + `[psm${psm}] ${text}`.slice(0, 120);
    const candidates = normalize(text).match(PLATE_RE) || [];
    for (const c of candidates) {
      const v = validarPatente(c);
      if (v.valido) {
        return { patente: c, valido: true, descripcion: v.descripcion, confianza: 0.9, formato_detectado: v.formato, raw_text: rawAll };
      }
      // No validó tal cual: probar corrección de confusiones (O↔0, I↔1, etc.).
      const fixed = tryFixPlate(c);
      if (fixed) {
        return { patente: fixed.patente, valido: true, descripcion: fixed.descripcion, confianza: 0.75, formato_detectado: fixed.formato, raw_text: `${rawAll}\n[corregido] ${c} → ${fixed.patente}`.slice(0, 240) };
      }
    }
    // Sin candidato exacto: tokens alfanuméricos de 6-7 chars con corrección.
    const tokens = normalize(text).match(/[A-Z0-9]{6,7}/g) || [];
    for (const t of tokens) {
      const fixed = tryFixPlate(t);
      if (fixed) {
        return { patente: fixed.patente, valido: true, descripcion: fixed.descripcion, confianza: 0.7, formato_detectado: fixed.formato, raw_text: `${rawAll}\n[corregido] ${t} → ${fixed.patente}`.slice(0, 240) };
      }
    }
  }
  return {
    patente: '',
    valido: false,
    descripcion: 'No se detectó una patente válida',
    confianza: 0,
    formato_detectado: 'desconocido',
    raw_text: rawAll.slice(0, 240),
  };
}

export async function recognize(imageInput, _opts = {}) {
  const filePath = resolveLocalPath(imageInput);

  // Visión primero (si está configurada): calidad "igual que Base44".
  if (await visionAvailable()) {
    try {
      const r = await recognizeWithVision(filePath);
      if (r && r.patente) return r;
      // Si la visión no encontró patente, probamos tesseract antes de rendirnos.
    } catch (e) {
      console.warn('[readPatente] visión falló, fallback a tesseract:', e.message);
    }
  }

  return recognizeWithTesseract(filePath);
}