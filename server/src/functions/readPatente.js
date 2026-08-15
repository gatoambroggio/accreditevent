// Lectura de patentes con Tesseract OCR (100% local, sin internet).
// Recibe una URL de imagen local o un path y devuelve la patente normalizada
// y validada con formato argentino (AAA999 | AA999AA | AA999AAA).

import Tesseract from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const PLATE_RE = /\b([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{2}\d{3}[A-Z]{3}|\d{3}[A-Z]{2}\d{2}|[A-Z]{3}\d{3})\b/;

function normalize(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidPlate(p) {
  return /^(AA\d{3}[A-Z]{2,3}|AAA\d{3}|\d{3}[A-Z]{2}\d{2})$/.test(p);
}

export async function recognize(imageInput, _opts = {}) {
  // imageInput puede ser: path local, o file_url tipo http://<lan>/uploads/x.jpg
  let filePath = imageInput;
  if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
    // descargar de uploads locales
    const rel = imageInput.replace(env.lanBaseUrl, '');
    const cand = path.resolve(rel.replace(/^\//, ''));
    filePath = fs.existsSync(cand) ? cand : path.join(env.uploadDir, path.basename(rel));
  }
  if (!fs.existsSync(filePath)) throw new Error(`Imagen no encontrada: ${filePath}`);

  const { data } = await Tesseract.recognize(filePath, env.tesseractLang, {
    logger: () => {},
  });
  const text = data?.text || '';
  const clean = normalize(text);
  const match = clean.match(PLATE_RE) || text.toUpperCase().match(PLATE_RE);
  const patente = match ? normalize(match[1]) : clean.slice(0, 7);

  return {
    patente,
    valido: isValidPlate(patente),
    descripcion: match ? 'Patente detectada' : 'Formato a verificar',
    confianza: match ? 0.9 : 0.4,
    formato_detectado: match ? match[1].length === 7 ? 'nuevo_mercosur' : 'viejo' : 'desconocido',
    raw_text: text.slice(0, 120),
  };
}