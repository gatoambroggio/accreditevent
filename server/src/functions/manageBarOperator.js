// Gestión de operadores de barra (entidad BarOperator) — versión servidor local.
// No crea usuarios de plataforma ni envía invitaciones. Se invoca desde el panel
// (admin/coordinator/productora) vía /api/functions/manageBarOperator (con token).
// Acciones: list | create | update | password | delete.

import { hashPassword } from '../shared/barPassword.js';

const ALLOWED_ROLES = ['superadmin', 'admin', 'coordinator', 'productora'];

export async function manageBarOperator(body, { user, prisma }) {
  if (!user) return { error: 'No autenticado', status: 401 };
  const role = user.role;
  if (!ALLOWED_ROLES.includes(role)) {
    return { error: 'No tenés permisos para gestionar operadores de barra', status: 403 };
  }
  const myCompany = (user.data?.company || '').toString();
  const scopeOk = (company) => {
    if (role !== 'productora') return true;
    if (!myCompany) return false;
    return (company || '').toUpperCase() === myCompany.toUpperCase();
  };

  async function resolveBar(barId) {
    if (!barId) return null;
    const bar = await prisma.bar.findUnique({ where: { id: barId } }).catch(() => null);
    if (!bar) return null;
    let event = null;
    if (bar.event_id) {
      event = await prisma.event.findUnique({ where: { id: bar.event_id } }).catch(() => null);
    }
    return { bar, event, company: (bar.company || event?.company || '') };
  }

  const action = (body.action || 'list').toString();

  if (action === 'list') {
    let ops = await prisma.barOperator.findMany({ orderBy: { created_at: 'desc' }, take: 500 });
    ops = ops.map((o) => ({
      id: o.id, username: o.username, full_name: o.full_name, company: o.company,
      blocked: !!o.blocked, bar_id: o.bar_id, bar_name: o.bar_name, event_id: o.event_id, event_name: o.event_name,
    }));
    if (role === 'productora' && myCompany) {
      ops = ops.filter((o) => (o.company || '').toUpperCase() === myCompany.toUpperCase());
    }
    return { ok: true, operators: ops };
  }

  if (action === 'create') {
    const username = (body.username || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();
    const barId = (body.bar_id || '').toString();
    const fullName = (body.full_name || '').toString().trim();
    if (!username || !password || !barId) {
      return { error: 'usuario, contraseña y barra son obligatorios', status: 400 };
    }
    if (password.length < 6) {
      return { error: 'La contraseña debe tener al menos 6 caracteres', status: 400 };
    }
    if (!/^[a-z0-9._+-]+$/i.test(username)) {
      return { error: 'El usuario sólo puede tener letras, números, punto, guión o guión bajo', status: 400 };
    }
    const resolved = await resolveBar(barId);
    if (!resolved) return { error: 'Barra no encontrada', status: 404 };
    const { bar, event, company } = resolved;
    if (!scopeOk(company)) return { error: 'La barra no pertenece a tu empresa', status: 403 };
    const existing = await prisma.barOperator.findUnique({ where: { username } }).catch(() => null);
    if (existing) return { error: 'Ya existe un operador con ese usuario', status: 400 };
    const password_hash = hashPassword(password);
    const created = await prisma.barOperator.create({
      data: {
        username,
        password_hash,
        full_name: fullName || username,
        bar_id: barId,
        bar_name: bar.name,
        event_id: bar.event_id || '',
        event_name: event?.name || bar.event_name || '',
        company: company || (role === 'productora' ? myCompany : ''),
        blocked: false,
      },
    });
    return { ok: true, operator: { id: created.id, username } };
  }

  if (action === 'update') {
    const id = (body.id || body.operator_id || '').toString();
    if (!id) return { error: 'id requerido', status: 400 };
    const op = await prisma.barOperator.findUnique({ where: { id } });
    if (!op) return { error: 'Operador no encontrado', status: 404 };
    if (!scopeOk(op.company || '')) return { error: 'El operador no pertenece a tu empresa', status: 403 };
    const update = {};
    if (body.bar_id !== undefined) {
      const resolved = await resolveBar(body.bar_id);
      if (!resolved) return { error: 'Barra no encontrada', status: 404 };
      if (!scopeOk(resolved.company)) return { error: 'La barra no pertenece a tu empresa', status: 403 };
      update.bar_id = body.bar_id;
      update.bar_name = resolved.bar.name;
      update.event_id = resolved.bar.event_id || '';
      update.event_name = resolved.event?.name || resolved.bar.event_name || '';
      update.company = resolved.company || op.company || (role === 'productora' ? myCompany : '');
    }
    if (body.blocked !== undefined) update.blocked = !!body.blocked;
    if (body.full_name !== undefined) update.full_name = body.full_name;
    await prisma.barOperator.update({ where: { id }, data: update });
    return { ok: true };
  }

  if (action === 'password') {
    const id = (body.id || body.operator_id || '').toString();
    const newPassword = (body.newPassword || '').toString();
    if (!id || !newPassword || newPassword.length < 6) {
      return { error: 'id y newPassword (mínimo 6) obligatorios', status: 400 };
    }
    const op = await prisma.barOperator.findUnique({ where: { id } });
    if (!op) return { error: 'Operador no encontrado', status: 404 };
    if (!scopeOk(op.company || '')) return { error: 'El operador no pertenece a tu empresa', status: 403 };
    await prisma.barOperator.update({ where: { id }, data: { password_hash: hashPassword(newPassword) } });
    return { ok: true };
  }

  if (action === 'delete') {
    const id = (body.id || '').toString();
    if (!id) return { error: 'id requerido', status: 400 };
    const op = await prisma.barOperator.findUnique({ where: { id } });
    if (!op) return { error: 'Operador no encontrado', status: 404 };
    if (!scopeOk(op.company || '')) return { error: 'El operador no pertenece a tu empresa', status: 403 };
    await prisma.barOperator.delete({ where: { id } });
    return { ok: true };
  }

  return { error: 'Acción inválida', status: 400 };
}