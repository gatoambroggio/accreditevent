import { Router } from 'express';
import { prisma } from '../db/prisma.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'down', error: e.message });
  }
});