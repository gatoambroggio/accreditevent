import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';

export const filesRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(env.uploadDir, { recursive: true });
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.bin');
    cb(null, `${nanoid(16)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes },
});

filesRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
  const file_url = `${env.lanBaseUrl}/uploads/${req.file.filename}`;
  res.json({ file_url, original_name: req.file.originalname, size: req.file.size, mime_type: req.file.mimetype });
});