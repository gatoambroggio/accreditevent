// Ruta de importación de datos desde un ZIP exportado por exportData.
// Recibe el ZIP por multipart, lo guarda en tmp y ejecuta el script
// import-from-zip.js como child process (robusto + reutiliza el código que ya anda).
// Solo admins/superadmins. Self-hosted only.

import { Router } from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const importRouter = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

importRouter.post('/', upload.single('file'), (req, res) => {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    // Limpia el archivo subido aunque rechace
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Solo administradores pueden importar datos.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Falta el archivo ZIP.' });
  }

  const zipPath = req.file.path;
  const scriptPath = path.resolve('src/import-from-zip.js');
  const child = spawn('node', [scriptPath, zipPath], { cwd: process.cwd() });

  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { err += d.toString(); });

  // Timeout de 10 min para datasets grandes
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
  }, 10 * 60 * 1000);

  child.on('close', (code) => {
    clearTimeout(timer);
    fs.unlink(zipPath, () => {});
    if (code === 0) {
      res.json({ data: { ok: true, output: out + err } });
    } else {
      res.status(500).json({ error: 'Importación fallida', output: out + err });
    }
  });

  child.on('error', (e) => {
    clearTimeout(timer);
    fs.unlink(zipPath, () => {});
    res.status(500).json({ error: 'No se pudo ejecutar la importación: ' + e.message });
  });
});