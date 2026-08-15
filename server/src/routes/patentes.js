import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { recognize } from '../functions/readPatente.js';

export const patentesRouter = Router();

const upload = multer({ limits: { fileSize: env.maxUploadBytes } });

// POST /api/patentes/read — recibe una imagen y devuelve la patente leída.
// El frontend (PatenteScanner) sube la imagen y llama a functions.invoke('readPatente').
// También exponemos esta ruta directa para integraciones hardware.
patentesRouter.post('/read', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen requerida' });
    const result = await recognize(req.file.path);
    res.json(result);
  } catch (e) { next(e); }
});