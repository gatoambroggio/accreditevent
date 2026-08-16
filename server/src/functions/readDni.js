// OCR local de DNI argentino con el binario `tesseract` del sistema (offline).
// Reemplaza al InvokeLLM cloud que no funciona en air-gapped.
// Heurística simple sobre el texto OCR:
//   - el número de 7-8 dígitos = dni
//   - las primeras líneas con texto (letras) = apellido / nombre
// El resultado es editable en el modal, así que la heurística imperfecta
// alcanza: el usuario corrige lo que haga falta antes de confirmar.

import { resolveLocalPath, runTesseract } from './_ocr.js';

export async function readDni({ file_url } = {}) {
  const filePath = resolveLocalPath(file_url);
  const text = await runTesseract(filePath, { psm: 6 });
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // DNI: primera línea con 7-8 dígitos (acepta puntos/espacios intermedios).
  let dni = '';
  for (const l of lines) {
    const digits = l.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 8) { dni = digits; break; }
  }
  if (!dni) {
    const m = text.match(/\d{7,8}/);
    if (m) dni = m[0];
  }

  // Apellido / nombre: líneas con al menos 3 letras, sin números largos.
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