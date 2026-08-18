import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '../db/prisma.js';

const execFileAsync = promisify(execFile);

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'down', error: e.message });
  }
});

// Diagnóstico de OCR (público, sin auth): informa el estado real de Tesseract
// en el servidor — versión, idiomas instalados y si la visión LLM está activa.
// Útil para verificar desde el navegador que el OCR vaya a funcionar:
//   curl -k https://127.0.0.1/api/health/ocr
healthRouter.get('/ocr', async (_req, res) => {
  const status = { tesseract: null, langs: [], spa_available: false, vision: false };
  try {
    const { stdout } = await execFileAsync('tesseract', ['--version'], { timeout: 10000 });
    status.tesseract = (stdout.split('\n')[0] || '').trim();
  } catch (e) { status.tesseract_error = e.message; }
  try {
    const { stdout } = await execFileAsync('tesseract', ['--list-langs'], { timeout: 10000 });
    status.langs = stdout.split('\n').map((l) => l.trim()).filter((l) => l && !/^list/i.test(l));
    status.spa_available = status.langs.includes('spa');
  } catch (e) { status.langs_error = e.message; }
  try {
    const s = await prisma.systemSetting.findFirst();
    status.vision = !!(s?.vision_ocr?.api_key) || !!process.env.VISION_API_KEY;
  } catch {}
  res.json(status);
});