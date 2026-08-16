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
        return {
          patente: c,
          valido: true,
          descripcion: v.descripcion,
          confianza: 0.9,
          formato_detectado: v.formato,
          raw_text: rawAll,
        };
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