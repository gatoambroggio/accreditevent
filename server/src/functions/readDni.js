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
// Heurística robusta para el DNI argentino (formato nuevo, anverso):
//   - DNI: línea con etiqueta "DNI"/"DOCUMENTO"/"CUIL"/"CUIT" seguida de 7-8
//     dígitos, o la primera línea con 7-8 dígitos puros.
//   - Nombre/apellido: primeras dos líneas con letras (excluyendo etiquetas
//     conocidas del DNI: APELLIDO, NOMBRE, DOCUMENTO, DOMICILIO, FECHA, SEXO,
//     LUGAR, NACIMIENTO, PROVINCIA, etc.). En el DNI argentino el apellido
//     aparece antes que el nombre.
const DNI_LABELS = /^(apellido|nombre|nombres|documento|dni|cuil|cuit|domicilio|fecha|sexo|lugar|nacimiento|provincia|nacionalidad|estadocivil|expira|vencimiento)\b/i;
const DNI_DIGIT_LINE = /(\d[\d.]{6,9}\d)/;

async function readDniWithTesseract(filePath) {
  // Probar varios PSM: 6 (bloque), 3 (auto página), 4 (columna). El DNI tiene
  // layout estructurado, así que alguno suele respetar las líneas.
  let text = '';
  for (const psm of [6, 3, 4]) {
    try {
      const t = await runTesseract(filePath, { psm });
      if (t && t.trim().length > (text.trim().length || 0)) text = t;
    } catch {}
  }
  if (!text.trim()) {
    return { nombre: '', apellido: '', dni: '', raw_text: '(Tesseract no devolvió texto)' };
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // DNI: priorizar líneas con etiqueta, luego la primera con 7-8 dígitos.
  let dni = '';
  for (const l of lines) {
    if (/^(dni|documento|cuil|cuit)\b/i.test(l)) {
      const m = l.match(/\d[\d.]{6,9}\d/);
      if (m) { dni = m[0].replace(/\D/g, ''); break; }
    }
  }
  if (!dni || dni.length < 7 || dni.length > 8) {
    for (const l of lines) {
      const m = l.match(DNI_DIGIT_LINE);
      if (m) {
        const d = m[1].replace(/\D/g, '');
        if (d.length >= 7 && d.length <= 8) { dni = d; break; }
      }
    }
  }
  // Fallback global: primer bloque de 7-8 dígitos en todo el texto.
  if (!dni) {
    const m = text.match(/\b(\d{7,8})\b/);
    if (m) dni = m[1];
  }

  // Nombre/apellido: líneas con >=3 letras, sin dígitos largos, sin etiquetas.
  const nameLines = lines.filter((l) => {
    if (DNI_LABELS.test(l)) return false;
    const letters = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    return letters.length >= 3 && !/\d{3,}/.test(l);
  });

  return {
    nombre: nameLines[1] || nameLines[0] || '',
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