// Configura SystemSetting.vision_ocr para usar Groq (visión cloud rápida, ~2-4s)
// con un modelo multimodal (Llama 4 Scout). Bypasea el panel: garantiza endpoint
// + modelo correctos y preserva el case de la API key (Groq es case-sensitive).
//
// Uso (una sola vez en el servidor Ubuntu, desde server/):
//   GROQ_API_KEY=gsk_... node src/configure-vision-groq.js
//   node src/configure-vision-groq.js gsk_...        # o la key como 1er argumento
//
// Después reiniciá el servicio:  sudo systemctl restart accreditevent
import { prisma } from './db/prisma.js';

const GROQ_KEY = process.env.GROQ_API_KEY || process.argv[2] || '';
const GROQ_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';

async function main() {
  if (!GROQ_KEY) {
    console.error('Falta la API key. Usá: GROQ_API_KEY=gsk_... node src/configure-vision-groq.js');
    process.exit(1);
  }
  const vision = { api_key: GROQ_KEY, base_url: GROQ_BASE, model: GROQ_MODEL };
  const existing = await prisma.systemSetting.findFirst();
  if (existing) {
    await prisma.systemSetting.update({ where: { id: existing.id }, data: { vision_ocr: vision } });
  } else {
    await prisma.systemSetting.create({ data: { vision_ocr: vision } });
  }
  console.log('[configure-vision-groq] vision_ocr → Groq');
  console.log(`  api_key:  ${GROQ_KEY.slice(0, 8)}...${GROQ_KEY.slice(-4)}`);
  console.log(`  base_url: ${GROQ_BASE}`);
  console.log(`  model:    ${GROQ_MODEL}`);
  console.log('Reiniciá el servicio:  sudo systemctl restart accreditevent');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());