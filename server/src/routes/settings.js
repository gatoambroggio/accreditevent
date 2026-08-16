import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { invalidateVisionCache } from '../functions/_visionOcr.js';

export const settingsRouter = Router();

async function getSingleton() {
  return prisma.systemSetting.findFirst();
}

// List (devuelve array para emular list() del SDK) — con o sin id.
settingsRouter.get('/', async (_req, res, next) => {
  try {
    const s = await getSingleton();
    res.json(s ? [s] : []);
  } catch (e) { next(e); }
});
settingsRouter.get('/:id', async (req, res, next) => {
  try {
    const s = await prisma.systemSetting.findUnique({ where: { id: req.params.id } });
    if (!s) return res.status(404).json({ error: 'No encontrado' });
    res.json(s);
  } catch (e) { next(e); }
});

// Update singleton: acepta PUT / (sin id) y PUT /:id (con id, lo usa el SDK local).
async function applyUpdate(id, data) {
  let s;
  if (id) {
    s = await prisma.systemSetting.update({ where: { id }, data });
  } else {
    const existing = await getSingleton();
    if (existing) {
      s = await prisma.systemSetting.update({ where: { id: existing.id }, data });
    } else {
      s = await prisma.systemSetting.create({ data });
    }
  }
  invalidateVisionCache();
  return s;
}

settingsRouter.put('/', async (req, res, next) => {
  try { res.json(await applyUpdate(null, req.body)); } catch (e) { next(e); }
});
settingsRouter.put('/:id', async (req, res, next) => {
  try { res.json(await applyUpdate(req.params.id, req.body)); } catch (e) { next(e); }
});