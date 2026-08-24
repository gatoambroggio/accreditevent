// Rutas de facturación AFIP por empresa productora (Company). Maneja la subida
// del certificado y la clave (.pem) a un directorio privado por empresa en el
// servidor y la prueba de conexión contra AFIP con las credenciales de esa
// empresa. El CAE mismo se emite desde afipIssue / afipSyncPending.
//
// Permisos: admin/superadmin pueden gestionar cualquier empresa; productora
// sólo la suya (user.data.company === company.name).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import {
  invalidateAfipCache,
  invalidateAfipReachability,
  afipReachable,
  getCompanyAfipConfig,
  getCompanyAfip,
} from '../functions/_afip.js';

export const afipRouter = Router();

const AFIP_DIR = path.resolve(process.env.AFIP_DIR || path.join(process.cwd(), 'private', 'afip'));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(AFIP_DIR, { recursive: true }); cb(null, AFIP_DIR); },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '.pem') || '.pem';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 },
});

function canManageCompany(user, company) {
  const r = user?.role;
  if (r === 'admin' || r === 'superadmin') return true;
  if (r === 'productora') {
    const uc = user?.data?.company || user?.company;
    return !!uc && uc === company.name;
  }
  return false;
}

async function loadCompany(req, res) {
  const { companyId } = req.params;
  const company = await prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);
  if (!company) { res.status(404).json({ error: 'Empresa no encontrada' }); return null; }
  if (!canManageCompany(req.user, company)) { res.status(403).json({ error: 'Sin permiso para gestionar AFIP de esta empresa' }); return null; }
  return company;
}

async function setAfipField(company, patch) {
  const afip = { ...(company.afip || {}), ...patch };
  const updated = await prisma.company.update({ where: { id: company.id }, data: { afip } });
  invalidateAfipCache(company.id);
  return updated;
}

// Sube cert (kind=cert) o clave (kind=key) al disco privado de la empresa.
afipRouter.post('/:companyId/cert', upload.single('file'), async (req, res, next) => {
  try {
    const company = await loadCompany(req, res);
    if (!company) return;
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const kind = String(req.body.kind || 'cert').toLowerCase();
    if (kind !== 'cert' && kind !== 'key') return res.status(400).json({ error: 'kind debe ser "cert" o "key"' });
    const dir = path.join(AFIP_DIR, company.id);
    fs.mkdirSync(dir, { recursive: true });
    const filename = kind === 'cert' ? 'cert.pem' : 'key.pem';
    const finalPath = path.join(dir, filename);
    fs.renameSync(req.file.path, finalPath);
    await setAfipField(company, { [`${kind}_path`]: finalPath });
    res.json({ ok: true, path: finalPath, kind });
  } catch (e) { next(e); }
});

// Prueba la conexión a AFIP con las credenciales de la empresa.
afipRouter.post('/:companyId/test', async (req, res) => {
  try {
    const company = await loadCompany(req, res);
    if (!company) return;
    const cfg = await getCompanyAfipConfig(prisma, company.id);
    if (!cfg) return res.json({ ok: false, error: 'La empresa no tiene AFIP configurado' });
    const a = cfg.afip;
    if (!a.cuit) return res.json({ ok: false, error: 'Falta configurar el CUIT' });
    const reachable = await afipReachable();
    if (!reachable) return res.json({ ok: false, error: 'Sin conexión a afip.gob.ar. ¿El servidor tiene salida a internet?' });
    let afip;
    try { afip = await getCompanyAfip(prisma, company.id, a); }
    catch (e) { return res.json({ ok: false, error: e.message }); }
    const status = await afip.ElectronicBilling.getServerStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.json({ ok: false, error: (e.message || String(e)).slice(0, 400) });
  }
});

// Estado de la configuración de la empresa (mascarada: sólo si cert/key cargados).
afipRouter.get('/:companyId/status', async (req, res, next) => {
  try {
    const company = await loadCompany(req, res);
    if (!company) return;
    const a = company.afip || {};
    res.json({
      modo: a.modo || 'disabled',
      cuit: a.cuit,
      pto_vta: a.pto_vta,
      cert_set: !!(a.cert_path && fs.existsSync(a.cert_path)),
      key_set: !!(a.key_path && fs.existsSync(a.key_path)),
      reachable: await afipReachable(),
    });
  } catch (e) { next(e); }
});

// Invalida caches de una empresa (al guardar config desde el panel).
afipRouter.post('/:companyId/invalidate', async (req, res, next) => {
  try {
    const company = await loadCompany(req, res);
    if (!company) return;
    invalidateAfipCache(company.id);
    invalidateAfipReachability();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export { AFIP_DIR };