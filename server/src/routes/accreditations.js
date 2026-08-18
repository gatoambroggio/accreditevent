import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { canAccess, getPolicy, buildWhere } from '../rls/engine.js';
import { genBadgePrefix } from '../auth/bcrypt.js';
import { broadcast } from '../realtime/ws.js';

export const accreditationsRouter = Router();

// Generación de badge_code único por access_level.
async function genBadgeCode(accessLevel) {
  const prefix = (accessLevel || 'GEN').slice(0, 3).toUpperCase();
  for (let i = 0; i < 5; i++) {
    const code = `${prefix}-${genBadgePrefix(6)}`;
    const exists = await prisma.accreditation.findUnique({ where: { badge_code: code } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un badge_code único');
}

// LIST (con RLS)
accreditationsRouter.get('/', async (req, res, next) => {
  try {
    const items = await prisma.accreditation.findMany({
      where: buildRls('read', req.user),
      take: Math.min(parseInt(req.query.limit || '50', 10), 500),
      orderBy: { created_at: 'desc' },
    });
    res.json(items);
  } catch (e) { next(e); }
});

// GET by id
accreditationsRouter.get('/:id', async (req, res, next) => {
  try {
    const rec = await prisma.accreditation.findUnique({ where: { id: req.params.id } });
    if (!rec) return res.status(404).json({ error: 'No encontrado' });
    if (!canAccess(getPolicy('Accreditation', 'read'), req.user, rec)) return res.status(403).json({ error: 'Sin permiso' });
    res.json(rec);
  } catch (e) { next(e); }
});

// CREATE — genera badge_code, denormaliza event/person/company.
accreditationsRouter.post('/', async (req, res, next) => {
  try {
    const { event_id, person_id, access_level, event_phases, area } = req.body;
    if (!event_id || !person_id) return res.status(400).json({ error: 'event_id y person_id son requeridos' });
    const event = await prisma.event.findUnique({ where: { id: event_id } });
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    const person = await prisma.person.findUnique({ where: { id: person_id } });
    if (!person) return res.status(404).json({ error: 'Persona no encontrada' });

    const payload = {
      event_id,
      event_name: event.name,
      company: event.company || person.productora || person.company,
      person_id,
      person_name: person.full_name,
      person_type: person.person_type,
      person_email: person.email,
      badge_code: req.body.badge_code || (await genBadgeCode(access_level || person.access_area || 'GEN')),
      area: area || person.access_area,
      access_level: access_level || 'general',
      event_phases: event_phases || person.event_phases || [],
      status: 'active',
      created_by_id: req.user.id,
    };

    if (!canAccess(getPolicy('Accreditation', 'create'), req.user, payload)) {
      return res.status(403).json({ error: 'Sin permiso para crear esta acreditación' });
    }
    const rec = await prisma.accreditation.create({ data: payload });
    broadcast('Accreditation', { id: rec.id, type: 'create', data: rec });
    res.status(201).json(rec);
  } catch (e) { next(e); }
});

// UPDATE
accreditationsRouter.put('/:id', async (req, res, next) => {
  try {
    const rec = await prisma.accreditation.findUnique({ where: { id: req.params.id } });
    if (!rec) return res.status(404).json({ error: 'No encontrado' });
    if (!canAccess(getPolicy('Accreditation', 'update'), req.user, rec)) return res.status(403).json({ error: 'Sin permiso' });
    const { status, block_reason, access_level, event_phases, area, delivered_personal, delivered_vehicular, has_biometric } = req.body;
    const updated = await prisma.accreditation.update({
      where: { id: req.params.id },
      data: { status, block_reason, access_level, event_phases, area, delivered_personal, delivered_vehicular, has_biometric },
    });
    broadcast('Accreditation', { id: updated.id, type: 'update', data: updated });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE
accreditationsRouter.delete('/:id', async (req, res, next) => {
  try {
    const rec = await prisma.accreditation.findUnique({ where: { id: req.params.id } });
    if (!rec) return res.status(404).json({ error: 'No encontrado' });
    if (!canAccess(getPolicy('Accreditation', 'delete'), req.user, rec)) return res.status(403).json({ error: 'Sin permiso' });
    await prisma.accreditation.delete({ where: { id: req.params.id } });
    broadcast('Accreditation', { id: req.params.id, type: 'delete', data: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Helper RLS donde
function buildRls(op, user) {
  const w = buildWhere(getPolicy('Accreditation', op), user);
  if (!w) return undefined; // allow all
  if (Object.keys(w).length === 0) return { AND: [{ id: '__none__' }] }; // deny all
  return w;
}