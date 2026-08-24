// Helper de CRUD genérico con RLS. Cada ruta de entidad lo usa para list/get/
// create/update/delete aplicando la policy del motor.

import { Router } from 'express';
import { buildWhere, getPolicy, canAccess, mergeWhere, getModel, modelHasField } from './engine.js';
import { broadcast } from '../realtime/ws.js';

// Normaliza un where de query (puede venir con operadores $in, $ne, $or, $and).
function normalizeWhere(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const transform = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.startsWith('data.') ? k.slice(5) : k;
      if (k === '$or' || k === '$and') out[k === '$or' ? 'OR' : 'AND'] = v.map(transform);
      else if (v && typeof v === 'object' && !Array.isArray(v) && '$in' in v) out[key] = { in: v.$in };
      else if (v && typeof v === 'object' && !Array.isArray(v) && '$ne' in v) out[key] = { not: v.$ne };
      else out[key] = v;
    }
    return out;
  };
  return transform(raw);
}

export function makeCrudRouter(entityName) {
  const router = Router();
  const model = getModel(entityName);

  router.get('/', async (req, res, next) => {
    try {
      const rls = buildWhere(getPolicy(entityName, 'read'), req.user);
      if (rls && Object.keys(rls).length === 0) return res.status(403).json({ error: 'Sin permiso de lectura' });
      let userWhere;
      try { userWhere = req.query.where ? normalizeWhere(JSON.parse(req.query.where)) : undefined; } catch {}
      const where = mergeWhere(userWhere, rls);
      const sort = req.query.sort;
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
      // Mapea nombres Base44 → nombres Prisma (created_date/updated_date son la convención del SDK).
      const SORT_MAP = { created_date: 'created_at', updated_date: 'updated_at' };
      const normField = (f) => SORT_MAP[f] || f;
      const orderBy = sort?.startsWith('-')
        ? { [normField(sort.slice(1))]: 'desc' }
        : sort ? { [normField(sort)]: 'asc' } : undefined;
      const items = await model.findMany({ where, take: limit, orderBy });
      res.json(items);
    } catch (e) { next(e); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const rec = await model.findUnique({ where: { id: req.params.id } });
      if (!rec) return res.status(404).json({ error: 'No encontrado' });
      const policy = getPolicy(entityName, 'read');
      if (!canAccess(policy, req.user, rec)) return res.status(403).json({ error: 'Sin permiso sobre este registro' });
      res.json(rec);
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const policy = getPolicy(entityName, 'create');
      const data = { ...req.body };
      if (modelHasField(entityName, 'created_by_id') && req.user?.id) data.created_by_id = req.user.id;
      if (!canAccess(policy, req.user, data)) return res.status(403).json({ error: 'El registro no cumple el contexto de creación' });
      const rec = await model.create({ data });
      broadcast(entityName, { id: rec.id, type: 'create', data: rec });
      res.status(201).json(rec);
    } catch (e) { next(e); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const rec = await model.findUnique({ where: { id: req.params.id } });
      if (!rec) return res.status(404).json({ error: 'No encontrado' });
      const policy = getPolicy(entityName, 'update');
      if (!canAccess(policy, req.user, rec)) return res.status(403).json({ error: 'Sin permiso de edición' });
      const updated = await model.update({ where: { id: req.params.id }, data: req.body });
      broadcast(entityName, { id: updated.id, type: 'update', data: updated });
      res.json(updated);
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const rec = await model.findUnique({ where: { id: req.params.id } });
      if (!rec) return res.status(404).json({ error: 'No encontrado' });
      const policy = getPolicy(entityName, 'delete');
      if (!canAccess(policy, req.user, rec)) return res.status(403).json({ error: 'Sin permiso de borrado' });
      await model.delete({ where: { id: req.params.id } });
      broadcast(entityName, { id: req.params.id, type: 'delete', data: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  return router;
}