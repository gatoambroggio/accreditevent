// OCR de DNI argentino.
// 1) Si hay VISION_API_KEY: usa un LLM de visión (igual que Base44 cloud con
//    InvokeLLM) — extrae nombre/apellido/dni como JSON, máxima calidad.
// 2) Si no: cae a Tesseract local con heurística basada en etiquetas (offline).
//    El DNI imprime "APELLIDO"/"NOMBRE"/"DOCUMENTO" como etiquetas y el valor
//    real va en la línea siguiente; detectamos la etiqueta y tomamos ese valor.
//    El resultado es editable en el modal, así que la heurística imperfecta
//    alcanza: el usuario corrige lo que haga falta.

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
// Líneas que son exactamente una etiqueta del DNI (no son valores).
const LABEL_EXACT = /^(apellido|nombre|nombres|documento|dni|cuil|cuit|domicilio|fecha\s*de\s*nacimiento|sexo|lugar\s*de\s*nacimiento|provincia|nacionalidad|estado\s*civil|expira|vencimiento|entidad|nacionalidad|de\s+apellido|de\s+nombre)$/i;
// Líneas de decoración del DNI que no contienen datos del titular.
const DECORATION = /(republica\s+argentina|meridiano|estado\s+plurinacional|nacionalidad\s+argentina|guia|identidad|documento\s+nacional|«|»|^\s*\W+\s*$)/i;

function normalizeName(s) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toUpperCase()
    .replace(/[^A-ZÑ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca el valor asociado a una etiqueta: primero el resto de la misma línea
// después de la etiqueta, luego la próxima línea con contenido que no sea
// etiqueta ni decoración.
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

async function readDniWithTesseract(filePath) {
  // Probar PSM 6 (bloque uniforme) y 4 (columna) — respetan el orden de líneas
  // del DNI. Si ninguno devuelve texto, caemos a PSM 3 (auto página).
  let text = '';
  for (const psm of [6, 4, 3]) {
    try {
      const t = await runTesseract(filePath, { psm });
      if (t && t.trim().length > (text.trim().length || 0)) text = t;
      if (text.trim()) break;
    } catch {}
  }
  if (!text.trim()) {
    return { nombre: '', apellido: '', dni: '', raw_text: '(Tesseract no devolvió texto)' };
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // DNI: etiqueta DOCUMENTO/DNI/CUIL seguida de dígitos (misma o próxima línea),
  // luego primera línea con 7-8 dígitos, luego primer bloque 7-8 en el texto.
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
      if (m) {
        const d = m[1].replace(/\D/g, '');
        if (d.length >= 7 && d.length <= 8) { dni = d; break; }
      }
    }
  }
  if (!dni) {
    const m = text.match(/\b(\d{7,8})\b/);
    if (m) dni = m[1];
  }

  // Apellido y nombre: valor asociado a la etiqueta correspondiente.
  let apellido = normalizeName(findValueAfterLabel(lines, /^apellido\b/i));
  let nombre = normalizeName(findValueAfterLabel(lines, /^nombre(s)?\b/i));

  // Fallback: si no halló etiquetas, usar las primeras dos líneas con letras
  // (>=3 letras, sin dígitos largos, sin etiquetas ni decoración). En el DNI
  // argentino el apellido aparece antes que el nombre.
  if (!apellido && !nombre) {
    const nameLines = lines.filter((l) => {
      if (LABEL_EXACT.test(l) || DECORATION.test(l)) return false;
      const letters = l.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
      return letters.length >= 3 && !/\d{3,}/.test(l);
    });
    apellido = normalizeName(nameLines[0] || '');
    nombre = normalizeName(nameLines[1] || '');
  }

  return {
    nombre,
    apellido,
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