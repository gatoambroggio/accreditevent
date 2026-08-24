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
import net from 'node:net';
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

// Probe rápido de alcanzabilidad del endpoint de visión (<2s). En un servidor
// air-gapped sin internet, la API key está configurada pero el endpoint no se
// alcanza: detectarlo rápido evita esperar el timeout de fetch (30s) en cada
// OCR y cae de inmediato al Tesseract local. Se cachea el resultado 60s.
let _reachCache = null;
let _reachAt = 0;
async function isReachable(baseUrl, timeoutMs = 1500) {
  const now = Date.now();
  if (_reachCache !== null && now - _reachAt < 60000) return _reachCache;
  _reachAt = now;
  let ok = false;
  try {
    const u = new URL(baseUrl);
    const host = u.hostname;
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    ok = await Promise.race([
      new Promise((resolve) => {
        const sock = net.createConnection({ host, port });
        const t = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
        sock.once('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
        sock.once('error', () => { clearTimeout(t); resolve(false); });
      }),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs + 500)),
    ]);
  } catch {
    ok = false;
  }
  _reachCache = ok;
  return ok;
}

export function invalidateVisionReachability() {
  _reachCache = null;
  _reachAt = 0;
}

export async function visionAvailable() {
  const cfg = await getVisionConfig();
  if (!cfg.apiKey) return false;
  return isReachable(cfg.baseUrl);
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

  // Timeout duro de 25s: si Ollama está trabado o el modelo es muy lento en CPU,
  // aborta y readDni cae a Tesseract en vez de colgar al operador en "Procesando".
  // Con GPU moondream responde en 2-4s, así que 25s es margen suficiente.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
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