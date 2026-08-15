import { Router } from 'express';
import { prisma } from '../db/prisma.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res, next) => {
  try {
    const s = await prisma.systemSetting.findFirst();
    res.json(s || {});
  } catch (e) { next(e); }
});

settingsRouter.put('/', async (req, res, next) => {
  try {
    let s = await prisma.systemSetting.findFirst();
    if (s) {
      s = await prisma.systemSetting.update({ where: { id: s.id }, data: req.body });
    } else {
      s = await prisma.systemSetting.create({ data: req.body });
    }
    res.json(s);
  } catch (e) { next(e); }
});