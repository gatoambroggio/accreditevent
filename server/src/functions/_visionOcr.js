// OCR por LLM de visión (OpenAI-compatible). Replica la calidad del InvokeLLM
// cloud de Base44: un modelo multimodal lee la patente / DNI directamente de la
// imagen, que es muchísimo más confiable que Tesseract sobre fotos de cámara.
//
// Configuración (en orden de prioridad):
//   1) Panel (SystemSetting.vision_ocr) → {api_key, base_url, model}
//   2) Variables de entorno: VISION_API_KEY / VISION_BASE_URL / VISION_MODEL
//   3) Ninguna → las funciones caen a Tesseract local.
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/prisma.js';

const ENV_KEY = process.env.VISION_API_KEY || '';
const ENV_BASE = process.env.VISION_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const ENV_MODEL = process.env.VISION_MODEL || 'gpt-4o-mini';

// Cache corto de la config desde la DB (no queremos leerla en cada OCR).
let cache = null;
let cacheAt = 0;
const CACHE_TTL = 15000;

async function getVisionConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;
  try {
    const s = await prisma.systemSetting.findFirst();
    const v = s?.vision_ocr || {};
    cache = {
      apiKey: v.api_key || ENV_KEY,
      baseUrl: v.base_url || ENV_BASE,
      model: v.model || ENV_MODEL,
    };
  } catch {
    cache = { apiKey: ENV_KEY, baseUrl: ENV_BASE, model: ENV_MODEL };
  }
  cacheAt = now;
  return cache;
}

// Invalidá el cache (por ejemplo, justo después de guardar la config desde el panel).
export function invalidateVisionCache() {
  cache = null;
  cacheAt = 0;
}

function imageToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function visionAvailable() {
  const cfg = await getVisionConfig();
  return !!cfg.apiKey;
}

// Llama a un endpoint OpenAI-compatible con visión. Devuelve el contenido de
// texto del mensaje. Lanza si no hay key o la red falla — el caller hace fallback.
export async function visionExtract(filePath, { prompt, jsonSchema } = {}) {
  const cfg = await getVisionConfig();
  if (!cfg.apiKey) throw new Error('Vision OCR no configurado (sin API key)');
  const dataUrl = imageToDataUrl(filePath);

  const system = 'Sos un asistente preciso de OCR para documentos argentinos. '
    + 'Respondé SIEMPRE en español, en MAYÚSCULAS, sin espacios ni guiones en los códigos. '
    + 'Solo devolvé el JSON pedido, sin texto adicional ni markdown.';

  const userText = jsonSchema
    ? `${prompt}\n\nDevolvé EXACTAMENTE un JSON con estas claves: ${JSON.stringify(Object.keys(jsonSchema.properties))}.`
    : prompt;

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] },
    ],
    max_completion_tokens: 400,
    temperature: 1,
  };

  // Una API de visión cloud (Groq/OpenAI) responde en 2-4s. 30s da margen amplio
  // y, si el endpoint tarda más, aborta y cae rápido al fallback Tesseract en
  // vez de colgar al operador (que antes esperaba 2-3 min hasta el 504).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  let content = data?.choices?.[0]?.message?.content || '';
  // Groq a veces envuelve el JSON en fences de markdown (```json ... ``` o ``` ... ```).
  // readDni/readPatente esperan JSON puro, así que lo limpiamos acá antes de devolver.
  if (content) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) content = fenced[1];
    content = content.trim();
  }
  return content;
}