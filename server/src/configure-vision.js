// Apunta SystemSetting.vision_ocr al Ollama local (127.0.0.1:11434) para que
// readDni / readPatente usen el modelo de visión local en vez de Tesseract.
// Lo corre install.sh después de confirmar que Ollama + el modelo están cargados.
// El admin puede cambiar estos valores después desde Configuración → OCR.
//
//   node src/configure-vision.js
//   VISION_MODEL_NAME=llama3.2-vision node src/configure-vision.js
import { prisma } from './db/prisma.js';

async function main() {
  const model = process.env.VISION_MODEL_NAME || 'moondream';
  const vision = {
    // Ollama no exige auth, pero visionAvailable() requiere una api_key presente
    // para habilitar el camino de visión (si no, cae a Tesseract). 'ollama' es un
    // valor dummy que cumple ese check sin abrir ningún acceso real.
    api_key: 'ollama',
    base_url: 'http://127.0.0.1:11434/v1/chat/completions',
    model,
  };

  const existing = await prisma.systemSetting.findFirst();
  if (existing) {
    await prisma.systemSetting.update({ where: { id: existing.id }, data: { vision_ocr: vision } });
  } else {
    await prisma.systemSetting.create({ data: { vision_ocr: vision } });
  }
  console.log(`[configure-vision] vision_ocr → ${JSON.stringify(vision)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());