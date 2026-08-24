// Gestión de operadores de barra con credenciales propias (entidad BarOperator).
// No crea usuarios de plataforma ni envía invitaciones por email.
// Acciones: list | create | update | password | delete
// Permisos: superadmin, admin, coordinator, productora (filtrado por company).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { hashPassword } from '../../shared/barPassword.ts';

const ALLOWED_ROLES = ['superadmin', 'admin', 'coordinator', 'productora'];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'list').toString();

    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = caller.role || (caller.data && caller.data.role);
    if (!ALLOWED_ROLES.includes(role)) {
      return Response.json({ error: 'No tenés permisos para gestionar operadores de barra' }, { status: 403 });
    }
    const myCompany = (caller.company || (caller.data && caller.data.company) || '').toString();
    const scopeOk = (company: string) => {
      if (role !== 'productora') return true;
      if (!myCompany) return false;
      return (company || '').toUpperCase() === myCompany.toUpperCase();
    };

    async function resolveBar(barId: string) {
      if (!barId) return null;
      let bars: any[];
      try { bars = await base44.asServiceRole.entities.Bar.filter({ id: barId }); }
      catch { return null; }
      if (!bars || !bars.length) return null;
      const bar = bars[0];
      let event: any = null;
      if (bar.event_id) {
        try {
          const evs = await base44.asServiceRole.entities.Event.filter({ id: bar.event_id });
          if (evs && evs.length) event = evs[0];
        } catch {}
      }
      return { bar, event, company: (bar.company || event?.company || '') };
    }

    // ---------- LIST ----------
    if (action === 'list') {
      let ops = await base44.asServiceRole.entities.BarOperator.list('-created_date', 500);
      ops = (ops || []).map((o: any) => ({
        id: o.id,
        username: o.username,
        full_name: o.full_name,
        company: o.company,
        blocked: !!o.blocked,
        bar_id: o.bar_id,
        bar_name: o.bar_name,
        event_id: o.event_id,
        event_name: o.event_name,
      }));
      if (role === 'productora' && myCompany) {
        ops = ops.filter((o: any) => (o.company || '').toUpperCase() === myCompany.toUpperCase());
      }
      return Response.json({ ok: true, operators: ops });
    }

    // ---------- CREATE ----------
    if (action === 'create') {
      const username = (body.username || '').toString().trim().toLowerCase();
      const password = (body.password || '').toString();
      const barId = (body.bar_id || '').toString();
      const fullName = (body.full_name || '').toString().trim();
      if (!username || !password || !barId) {
        return Response.json({ error: 'usuario, contraseña y barra son obligatorios' }, { status: 400 });
      }
      if (password.length < 6) {
        return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }
      if (!/^[a-z0-9._+-]+$/i.test(username)) {
        return Response.json({ error: 'El usuario sólo puede tener letras, números, punto, guión o guión bajo' }, { status: 400 });
      }
      const resolved = await resolveBar(barId);
      if (!resolved) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
      const { bar, event, company } = resolved;
      if (!scopeOk(company)) {
        return Response.json({ error: 'La barra no pertenece a tu empresa' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.BarOperator.filter({ username });
      if (existing && existing.length) {
        return Response.json({ error: 'Ya existe un operador con ese usuario' }, { status: 400 });
      }
      const password_hash = await hashPassword(password);
      const created = await base44.asServiceRole.entities.BarOperator.create({
        username,
        password_hash,
        full_name: fullName || username,
        bar_id: barId,
        bar_name: bar.name,
        event_id: bar.event_id || '',
        event_name: event?.name || bar.event_name || '',
        company: company || (role === 'productora' ? myCompany : ''),
        blocked: false,
      });
      return Response.json({ ok: true, operator: { id: created.id, username } });
    }

    // ---------- UPDATE ----------
    if (action === 'update') {
      const id = (body.id || body.operator_id || '').toString();
      if (!id) return Response.json({ error: 'id requerido' }, { status: 400 });
      const found = await base44.asServiceRole.entities.BarOperator.filter({ id });
      if (!found || !found.length) return Response.json({ error: 'Operador no encontrado' }, { status: 404 });
      const op = found[0];
      if (!scopeOk(op.company || '')) {
        return Response.json({ error: 'El operador no pertenece a tu empresa' }, { status: 403 });
      }
      const update: any = {};
      if (body.bar_id !== undefined) {
        const resolved = await resolveBar(body.bar_id);
        if (!resolved) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
        if (!scopeOk(resolved.company)) return Response.json({ error: 'La barra no pertenece a tu empresa' }, { status: 403 });
        update.bar_id = body.bar_id;
        update.bar_name = resolved.bar.name;
        update.event_id = resolved.bar.event_id || '';
        update.event_name = resolved.event?.name || resolved.bar.event_name || '';
        update.company = resolved.company || op.company || (role === 'productora' ? myCompany : '');
      }
      if (body.blocked !== undefined) update.blocked = !!body.blocked;
      if (body.full_name !== undefined) update.full_name = body.full_name;
      await base44.asServiceRole.entities.BarOperator.update(id, update);
      return Response.json({ ok: true });
    }

    // ---------- PASSWORD ----------
    if (action === 'password') {
      const id = (body.id || body.operator_id || '').toString();
      const newPassword = (body.newPassword || '').toString();
      if (!id || !newPassword || newPassword.length < 6) {
        return Response.json({ error: 'id y newPassword (mínimo 6) obligatorios' }, { status: 400 });
      }
      const found = await base44.asServiceRole.entities.BarOperator.filter({ id });
      if (!found || !found.length) return Response.json({ error: 'Operador no encontrado' }, { status: 404 });
      if (!scopeOk(found[0].company || '')) {
        return Response.json({ error: 'El operador no pertenece a tu empresa' }, { status: 403 });
      }
      const password_hash = await hashPassword(newPassword);
      await base44.asServiceRole.entities.BarOperator.update(id, { password_hash });
      return Response.json({ ok: true });
    }

    // ---------- DELETE ----------
    if (action === 'delete') {
      const id = (body.id || '').toString();
      if (!id) return Response.json({ error: 'id requerido' }, { status: 400 });
      const found = await base44.asServiceRole.entities.BarOperator.filter({ id });
      if (!found || !found.length) return Response.json({ error: 'Operador no encontrado' }, { status: 404 });
      if (!scopeOk(found[0].company || '')) {
        return Response.json({ error: 'El operador no pertenece a tu empresa' }, { status: 403 });
      }
      await base44.asServiceRole.entities.BarOperator.delete(id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al gestionar operador de barra' }, { status: 500 });
  }
}