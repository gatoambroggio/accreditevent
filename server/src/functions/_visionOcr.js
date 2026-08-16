// OCR por LLM de visión (OpenAI-compatible). Replica la calidad del InvokeLLM
// cloud de Base44: un modelo multimodal lee la patente / DNI directamente de la
// imagen, que es muchísimo más confiable que Tesseract sobre fotos de cámara.
//
// Se activa solo si hay VISION_API_KEY en .env (y connectivity). Si no, las
// funciones caen a Tesseract local — así el sistema funciona igual sin API key,
// pero con la mejor calidad posible cuando sí la hay.
import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.VISION_API_KEY || '';
const BASE_URL = process.env.VISION_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.VISION_MODEL || 'gpt-4o-mini';

// Lee una imagen de disco y la convierte a data URL base64 para mandar al LLM.
function imageToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Llama a un endpoint OpenAI-compatible con visión. Devuelve el contenido de
// texto del mensaje (si response_json_schema se pasa, el modelo ya devuelve
// JSON como string). Lanza si no hay key o la red falla — el caller hace fallback.
export async function visionExtract(filePath, { prompt, jsonSchema } = {}) {
  if (!API_KEY) throw new Error('VISION_API_KEY no configurada');
  const dataUrl = imageToDataUrl(filePath);

  const system = 'Sos un asistente preciso de OCR para documentos argentinos. '
    + 'Respondé SIEMPRE en español, en MAYÚSCULAS, sin espacios ni guiones en los códigos. '
    + 'Solo devolvé el JSON pedido, sin texto adicional ni markdown.';

  const userText = jsonSchema
    ? `${prompt}\n\nDevolvé EXACTAMENTE un JSON con estas claves: ${JSON.stringify(Object.keys(jsonSchema.properties))}.`
    : prompt;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ] },
    ],
    max_tokens: 400,
    temperature: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
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
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
}

export function visionAvailable() {
  return !!API_KEY;
}