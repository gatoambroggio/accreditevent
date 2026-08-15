import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { hashPassword } from '../auth/bcrypt.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('superadmin', 'admin'));

usersRouter.get('/', async (_req, res, next) => {
  try { res.json(await prisma.user.findMany({ orderBy: { created_at: 'desc' }, select: { id: true, email: true, full_name: true, role: true, data: true, blocked: true, created_at: true } })); }
  catch (e) { next(e); }
});

usersRouter.put('/:id', async (req, res, next) => {
  try {
    const { role, blocked, full_name, data } = req.body;
    const update = {};
    if (role !== undefined) update.role = role;
    if (blocked !== undefined) update.blocked = blocked;
    if (full_name !== undefined) update.full_name = full_name;
    if (data !== undefined) update.data = data;
    res.json(await prisma.user.update({ where: { id: req.params.id }, data: update }));
  } catch (e) { next(e); }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try { await prisma.user.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// inviteUser: crea un usuario con rol y temp password (air-gap: sin email).
usersRouter.post('/invite', async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const e = String(email || '').toLowerCase();
    if (!e) return res.status(400).json({ error: 'Email requerido' });
    const exists = await prisma.user.findUnique({ where: { email: e } });
    if (exists) return res.status(409).json({ error: 'Ya existe' });
    const created = await prisma.user.create({ data: { email: e, password_hash: hashPassword('cambiar123'), role: role || 'user', email_verified: true, data: {} } });
    res.json({ ok: true, id: created.id, message: 'Usuario creado con contraseña temporal "cambiar123"' });
  } catch (e) { next(e); }
});