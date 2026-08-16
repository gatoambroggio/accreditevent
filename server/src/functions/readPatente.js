// Lectura de patentes con Tesseract OCR (100% local, sin internet).
// Recibe una URL de imagen local o un path y devuelve la patente normalizada
// y validada con formato argentino (AAA999 | AA999AA | AA999A | A999AAA).

import Tesseract from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

// ── Formatos válidos de patente argentina (sin espacios) ────────────────────
//   Auto Mercosur (2016+): AA999AA   -> [A-Z]{2}\d{3}[A-Z]{2}
//   Auto antiguo:          AAA999    -> [A-Z]{3}\d{3}
//   Moto Mercosur:         AA999A    -> [A-Z]{2}\d{3}[A-Z]
//   Moto antigua:          A999AAA   -> [A-Z]\d{3}[A-Z]{3}
const MERCOSUR_AUTO = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
const ANTIGUO_AUTO  = /^[A-Z]{3}\d{3}$/;
const MOTO_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]$/;
const MOTO_ANTIGUA  = /^[A-Z]\d{3}[A-Z]{3}$/;

// Regex de extracción: busca candidatos a patente en el texto OCR (ordenado
// de más específico a más corto para evitar cortar patentes largas).
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

  // Tesseract con config para placas: PSM 7 (una sola línea de texto) + whitelist
  // alfanumérica mayúscula. Mejora mucho la precisión vs. el OCR genérico.
  const { data } = await Tesseract.recognize(filePath, env.tesseractLang, {
    logger: () => {},
    tessedit_pageseg_mode: '7',
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  });
  const text = data?.text || '';
  const clean = normalize(text);

  // Solo aceptar patentes cuyo formato coincida con un patrón argentino válido.
  // Si Tesseract no encuentra nada que calce, devolvemos vacío (el usuario
  // puede escribir la patente a mano en el panel) en vez de devolver basura.
  const candidates = clean.match(PLATE_RE) || [];
  for (const c of candidates) {
    const v = validarPatente(c);
    if (v.valido) {
      return {
        patente: c,
        valido: true,
        descripcion: v.descripcion,
        confianza: 0.9,
        formato_detectado: v.formato,
        raw_text: text.slice(0, 120),
      };
    }
  }

  return {
    patente: '',
    valido: false,
    descripcion: 'No se detectó una patente válida',
    confianza: 0,
    formato_detectado: 'desconocido',
    raw_text: text.slice(0, 120),
  };
}