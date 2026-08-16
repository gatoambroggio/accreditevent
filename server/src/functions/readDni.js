// OCR de DNI argentino.
// 1) Si hay VISION_API_KEY: usa un LLM de visión (igual que Base44 cloud con
//    InvokeLLM) — extrae nombre/apellido/dni como JSON, máxima calidad.
// 2) Si no: cae a Tesseract local con heurística de líneas (offline, menor
//    calidad). El resultado es editable en el modal, así que la heurística
//    imperfecta alcanza: el usuario corrige lo que haga falta.

import { resolveLocalPath, runTesseract } from './_ocr.js';
import { visionExtract, visionAvailable } from './_visionOcr.js';

// ── Camino 1: LLM de visión ─────────────────────────────────────────────────
async function readDniWithVision(filePath) {
  const prompt = `Leé los datos del DNI argentino visible en la imagen.
Devolvé un JSON: {"apellido":"PEREZ","nombre":"JUAN","dni":"12345678"}.
- apellido y nombre en MAYÚSCULAS, sin acentos innecesarios.
- dni solo números, 7-8 dígitos, sin puntos ni espacios.
- Si un campo no se lee, devolvé cadena vacía para ese campo.`;
  const content = await visionExtract(filePath, { prompt, jsonSchema: { properties: { apellido: {}, nombre: {}, dni: {} } } });
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { return null; }
  const dni = String(parsed.dni || '').replace(/\D/g, '');
  return {
    nombre: String(parsed.nombre || '').toUpperCase().trim(),
    apellido: String(parsed.apellido || '').toUpperCase().trim(),
    dni,
    raw_text: `[vision] ${content.slice(0, 300)}`,
  };
}

// ── Camino 2: Tesseract local (offline) ─────────────────────────────────────
async function readDniWithTesseract(filePath) {
  let text = await runTesseract(filePath, { psm: 6 });
  if (!text || text.trim().length < 3) {
    try { text = await runTesseract(filePath, { psm: 3 }); } catch {}
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let dni = '';
  for (const l of lines) {
    const digits = l.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 8) { dni = digits; break; }
  }
  if (!dni) {
    const m = text.match(/\d{7,8}/);
    if (m) dni = m[0];
  }

  const nameLines = lines.filter((l) => {
    const letters = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    return letters.length >= 3 && !/\d{4,}/.test(l);
  });

  return {
    nombre: nameLines[1] || '',
    apellido: nameLines[0] || '',
    dni,
    raw_text: text.slice(0, 500),
  };
}

export async function readDni({ file_url } = {}) {
  const filePath = resolveLocalPath(file_url);

  if (await visionAvailable()) {
    try {
      const r = await readDniWithVision(filePath);
      if (r && (r.nombre || r.apellido || r.dni)) return r;
    } catch (e) {
      console.warn('[readDni] visión falló, fallback a tesseract:', e.message);
    }
  }

  return readDniWithTesseract(filePath);
}