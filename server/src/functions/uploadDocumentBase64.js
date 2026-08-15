import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

// Sube un archivo base64 al disco local (reemplaza UploadFile + base64 de Base44).
export async function uploadDocumentBase64({ base64, filename, mime_type }, { user, prisma }) {
  if (!base64 || !filename) throw Object.assign(new Error('Faltan datos del archivo'), { status: 400 });
  const cleanName = String(filename).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'documento';
  const b64 = String(base64).startsWith('data:') ? String(base64).split(',').pop() : String(base64);
  const bytes = Buffer.from(b64, 'base64');
  const dir = path.resolve(env.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fname = `${id}_${cleanName}`;
  fs.writeFileSync(path.join(dir, fname), bytes);
  const file_url = `${env.lanBaseUrl}/uploads/${fname}`;
  return { file_url };
}