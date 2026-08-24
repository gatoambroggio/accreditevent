// Rutas de facturación AFIP (sólo administradores). Maneja la subida del
// certificado y la clave (.pem) a un directorio privado del servidor y la
// prueba de conexión contra AFIP. El CAE mismo se emite desde las funciones
// afipIssue / afipSyncPending (dispatcheadas en /api/functions).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { prisma } from '../db/prisma.js';
import {
  invalidateAfipCache,
  invalidateAfipReachability,
  afipReachable,
  getAfipConfig,
  getAfip,
} from '../functions/_afip.js';

export const afipRouter = Router();

const AFIP_DIR = path.resolve(process.env.AFIP_DIR || path.join(process.cwd(), 'private', 'afip'));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(AFIP_DIR, { recursive: true }); cb(null, AFIP_DIR); },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '.pem') || '.pem';
      cb(null, `${nanoid(12)}${ext}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 },
});

function adminOnly(req, res, next) {
  const r = req.user?.role;
  if (r !== 'admin' && r !== 'superadmin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

async function setAfipField(patch) {
  const s = await prisma.systemSetting.findFirst();
  const afip = { ...(s?.afip || {}), ...patch };
  if (s) await prisma.systemSetting.update({ where: { id: s.id }, data: { afip } });
  else await prisma.systemSetting.create({ data: { afip } });
  invalidateAfipCache();
  return afip;
}

// Sube cert (kind=cert) o clave (kind=key) al disco privado del servidor.
afipRouter.post('/cert', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const kind = String(req.body.kind || 'cert').toLowerCase();
    if (kind !== 'cert' && kind !== 'key') return res.status(400).json({ error: 'kind debe ser "cert" o "key"' });
    const filePath = req.file.path;
    await setAfipField({ [`${kind}_path`]: filePath });
    res.json({ ok: true, path: filePath, kind });
  } catch (e) { next(e); }
});

// Prueba la conexión a AFIP (probe + estado del servidor wsfev1).
afipRouter.post('/test', adminOnly, async (_req, res) => {
  try {
    const cfg = await getAfipConfig();
    if (!cfg.cuit) return res.json({ ok: false, error: 'Falta configurar el CUIT' });
    const reachable = await afipReachable();
    if (!reachable) return res.json({ ok: false, error: 'Sin conexión a afip.gob.ar. ¿El servidor tiene salida a internet?' });
    let afip;
    try { afip = await getAfip(); }
    catch (e) { return res.json({ ok: false, error: e.message }); }
    const status = await afip.ElectronicBilling.getServerStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.json({ ok: false, error: (e.message || String(e)).slice(0, 400) });
  }
});

// Estado de la configuración (mascarada: sólo si cert/key están cargados).
afipRouter.get('/status', adminOnly, async (_req, res, next) => {
  try {
    const cfg = await getAfipConfig();
    res.json({
      cuit: cfg.cuit,
      pto_vta: cfg.pto_vta,
      enabled: cfg.enabled,
      cert_set: !!(cfg.cert_path && fs.existsSync(cfg.cert_path)),
      key_set: !!(cfg.key_path && fs.existsSync(cfg.key_path)),
      reachable: await afipReachable(),
    });
  } catch (e) { next(e); }
});

// Invalida caches cuando se guarda configuración desde el panel.
afipRouter.post('/invalidate', adminOnly, async (_req, res) => {
  invalidateAfipCache();
  invalidateAfipReachability();
  res.json({ ok: true });
});

export { AFIP_DIR };