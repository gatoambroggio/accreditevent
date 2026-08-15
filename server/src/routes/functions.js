import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { recognize } from '../functions/readPatente.js';
import { getEventAccessData } from '../functions/getEventAccessData.js';
import { faceIdentify } from '../functions/faceIdentify.js';

export const functionInvokeRouter = Router();

// Dispatcher de funciones del backend local — mismo contrato que
// base44.functions.invoke(name, payload). El frontend lo usa sin cambios.
const handlers = {
  getEventAccessData,
  readPatente: async (payload) => recognize(payload.file_url || payload.fileUrl, payload),
  faceIdentify,
};

functionInvokeRouter.post('/:name', async (req, res, next) => {
  try {
    const handler = handlers[req.params.name];
    if (!handler) return res.status(404).json({ error: `Función no encontrada: ${req.params.name}` });
    const out = await handler(req.body, { user: req.user, prisma });
    res.json({ data: out });
  } catch (e) { next(e); }
});