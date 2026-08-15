import { Router, json, text } from 'express';
import multer from 'multer';
import { prisma } from '../db/prisma.js';
import { handleDahuaEvent } from '../functions/dahuaWebhook.js';
import { handleZktGetOptions, handleZktGetCommands, handleZktPost } from '../functions/zktecoWebhook.js';

export const webhooksRouter = Router();

// Las terminales envían body como text/plain, application/json o multipart.
// Express global json() no cubre text ni multipart, así que montamos parsers
// específicos para los webhooks.
const rawText = text({ type: 'text/*' });
const anyJson = json({ type: 'application/json' });
// multipart sin guardar archivos: extraemos el campo "data"/"content" a texto.
const multipart = multer().none();

// --- Dahua: GET handshake, POST eventos ---
webhooksRouter.get('/dahua', (_req, res) => res.type('text/plain').send('OK'));
webhooksRouter.post('/dahua', async (req, res, next) => {
  try {
    const sn = req.query.sn || '';
    const apiKey = req.query.key || '';
    if (!sn) return res.type('text/plain').send('OK');
    const devices = await prisma.dahuaDevice.findMany({ where: { serial_number: String(sn) } });
    const device = devices[0];
    if (!device) return res.status(403).type('text/plain').send('ERROR: Device not registered');
    if (device.api_key && apiKey !== device.api_key) return res.status(403).type('text/plain').send('ERROR: Auth failed');
    await prisma.dahuaDevice.update({ where: { id: device.id }, data: { last_seen: new Date(), status: 'active' } }).catch(() => {});
    const raw = await readWebhookBody(req);
    await handleDahuaEvent(device, raw, prisma);
    res.type('text/plain').send('OK');
  } catch (e) { next(e); }
});

// --- ZKTeco: protocolo iClock ---
webhooksRouter.get('/zkteco', async (req, res, next) => {
  try {
    const sn = String(req.query.SN || '');
    if (!sn) return res.type('text/plain').send('OK');
    if (req.query.options !== undefined) return res.type('text/plain').send(await handleZktGetOptions());
    const devices = await prisma.zkTecoDevice.findMany({ where: { serial_number: sn } });
    const device = devices[0];
    if (!device) return res.status(403).type('text/plain').send('ERROR: Device not registered');
    if (device.api_key && req.query.key !== device.api_key) return res.status(403).type('text/plain').send('ERROR: Auth failed');
    await prisma.zkTecoDevice.update({ where: { id: device.id }, data: { last_seen: new Date(), status: 'active' } }).catch(() => {});
    res.type('text/plain').send(await handleZktGetCommands(device, prisma));
  } catch (e) { next(e); }
});
webhooksRouter.post('/zkteco', async (req, res, next) => {
  try {
    const sn = String(req.query.SN || '');
    if (!sn) return res.type('text/plain').send('OK');
    const devices = await prisma.zkTecoDevice.findMany({ where: { serial_number: sn } });
    const device = devices[0];
    if (!device) return res.status(403).type('text/plain').send('ERROR: Device not registered');
    if (device.api_key && req.query.key !== device.api_key) return res.status(403).type('text/plain').send('ERROR: Auth failed');
    await prisma.zkTecoDevice.update({ where: { id: device.id }, data: { last_seen: new Date(), status: 'active' } }).catch(() => {});
    const bodyText = await readWebhookBody(req);
    await handleZktPost(device, bodyText, prisma);
    res.type('text/plain').send('OK');
  } catch (e) { next(e); }
});

// Lee el body del webhook en cualquier formato (json, text, multipart) y
// devuelve un string normalizado para parsear eventos.
async function readWebhookBody(req) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    return new Promise((resolve) => {
      multipart(req, {}, () => {
        const b = req.body || {};
        const v = b.data || b.content || b.event || (typeof b === 'string' ? b : '');
        resolve(typeof v === 'string' ? v : (v ? JSON.stringify(v) : ''));
      });
    });
  }
  if (ct.includes('text/')) {
    return new Promise((resolve) => rawText(req, {}, () => resolve(typeof req.body === 'string' ? req.body : '')));
  }
  // json o sin content-type: ya parseado por express.json
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return typeof req.body === 'string' ? req.body : '';
}