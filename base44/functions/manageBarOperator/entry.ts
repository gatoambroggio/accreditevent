import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Dominio interno usado para convertir el nombre de usuario libre (ej. "barra1")
// en un email válido exigido por la plataforma: "barra1@barra.local". El operador
// sólo teclea el usuario; el dominio se agrega automáticamente en /bar-app.
const BAR_DOMAIN = 'barra.local';

const ALLOWED_ROLES = ['superadmin', 'admin', 'productora'];

function emailFromUsername(username) {
  return `${username.toString().trim().toLowerCase()}@${BAR_DOMAIN}`;
}

function usernameFromEmail(email) {
  if (!email) return '';
  return String(email).replace(new RegExp('@' + BAR_DOMAIN + '$', 'i'), '');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = caller.role || (caller.data && caller.data.role);
    if (!ALLOWED_ROLES.includes(role)) {
      return Response.json({ error: 'No tenés permisos para gestionar operadores de barra' }, { status: 403 });
    }
    const myCompany = (caller.company || (caller.data && caller.data.company) || '').toString();
    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'list').toString();

    const scopeOk = (company) => {
      if (role !== 'productora') return true;
      if (!myCompany) return false;
      return (company || '').toUpperCase() === myCompany.toUpperCase();
    };

    async function resolveBar(barId) {
      if (!barId) return null;
      const bars = await base44.asServiceRole.entities.Bar.filter({ id: barId });
      if (!bars || !bars.length) return null;
      const bar = bars[0];
      let event = null;
      if (bar.event_id) {
        const evs = await base44.asServiceRole.entities.Event.filter({ id: bar.event_id });
        if (evs && evs.length) event = evs[0];
      }
      return { bar, event, company: (bar.company || event?.company || '') };
    }

    // ---------- LIST ----------
    if (action === 'list') {
      const all = await base44.asServiceRole.entities.User.filter({ role: 'barra' }, '-created_date', 500);
      let ops = (all || []).map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        username: usernameFromEmail(u.email),
        company: u.company || (u.data && u.data.company) || '',
        blocked: !!u.blocked,
        bar_id: u.bar_id || (u.data && u.data.bar_id) || '',
        bar_event_id: u.bar_event_id || (u.data && u.data.bar_event_id) || '',
      }));
      if (role === 'productora' && myCompany) {
        ops = ops.filter((o) => (o.company || '').toUpperCase() === myCompany.toUpperCase());
      }
      const barIds = [...new Set(ops.map((o) => o.bar_id).filter(Boolean))];
      const bars = await Promise.all(barIds.map((id) => base44.asServiceRole.entities.Bar.filter({ id }).then((r) => r[0] || null).catch(() => null)));
      const barMap = {};
      bars.forEach((b) => { if (b) barMap[b.id] = b.name; });
      ops.forEach((o) => { o.bar_name = barMap[o.bar_id] || ''; });
      return Response.json({ ok: true, operators: ops });
    }

    // ---------- CREATE ----------
    if (action === 'create') {
      const username = (body.username || '').toString().trim();
      const password = (body.password || '').toString();
      const barId = (body.bar_id || '').toString();
      if (!username || !password || !barId) {
        return Response.json({ error: 'usuario, contraseña y barra son obligatorios' }, { status: 400 });
      }
      if (password.length < 6) {
        return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }
      if (!/^[a-z0-9._-]+$/i.test(username)) {
        return Response.json({ error: 'El usuario sólo puede tener letras, números, punto, guión o guión bajo' }, { status: 400 });
      }
      const resolved = await resolveBar(barId);
      if (!resolved) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
      const { bar, event, company } = resolved;
      if (!scopeOk(company)) {
        return Response.json({ error: 'La barra no pertenece a tu empresa' }, { status: 403 });
      }
      const email = emailFromUsername(username);
      const existing = await base44.asServiceRole.entities.User.filter({ email });
      if (existing && existing.length) {
        const exRole = existing[0].role || (existing[0].data && existing[0].data.role);
        if (exRole && exRole !== 'barra' && exRole !== 'user') {
          return Response.json({ error: 'Ya existe un usuario con ese nombre y tiene otro rol' }, { status: 400 });
        }
      }
      // Crear la cuenta (la plataforma sólo crea usuarios vía invitación). Ignoramos
      // errores de envío de email: la cuenta se crea igual y seteamos la clave nosotros.
      if (!existing || !existing.length) {
        try { await base44.users.inviteUser(email, 'user'); }
        catch (e) {
          const msg = (e.message || '').toLowerCase();
          if (!msg.includes('ya') && !msg.includes('exist') && !msg.includes('registrad') && !msg.includes('already')) {
            // continuamos igual: la cuenta pudo haberse creado
          }
        }
      }
      const found = await base44.asServiceRole.entities.User.filter({ email });
      if (!found || !found.length) {
        return Response.json({ error: 'No se pudo crear la cuenta del operador' }, { status: 500 });
      }
      const target = found[0];
      const patch = {
        role: 'barra',
        full_name: username,
        bar_id: barId,
        bar_event_id: bar.event_id || '',
        company: company || (role === 'productora' ? myCompany : ''),
        assigned_event_ids: bar.event_id ? [bar.event_id] : [],
      };
      await base44.asServiceRole.entities.User.update(target.id, patch);
      let pwWarning = '';
      try { await base44.auth.changePassword({ userId: target.id, newPassword: password }); }
      catch (e) { pwWarning = 'No se pudo setear la contraseña: ' + (e.message || e); }
      return Response.json({ ok: true, user: { id: target.id, email, username }, passwordWarning: pwWarning });
    }

    // ---------- UPDATE ----------
    if (action === 'update') {
      const userId = (body.user_id || '').toString();
      if (!userId) return Response.json({ error: 'user_id requerido' }, { status: 400 });
      const found = await base44.asServiceRole.entities.User.filter({ id: userId });
      if (!found || !found.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
      const target = found[0];
      const tRole = target.role || (target.data && target.data.role);
      if (tRole !== 'barra') return Response.json({ error: 'El usuario no es operador de barra' }, { status: 400 });
      if (!scopeOk(target.company || (target.data && target.data.company) || '')) {
        return Response.json({ error: 'El operador no pertenece a tu empresa' }, { status: 403 });
      }
      const update = {};
      if (body.bar_id !== undefined) {
        const resolved = await resolveBar(body.bar_id);
        if (!resolved) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
        if (!scopeOk(resolved.company)) return Response.json({ error: 'La barra no pertenece a tu empresa' }, { status: 403 });
        update.bar_id = body.bar_id;
        update.bar_event_id = resolved.bar.event_id || '';
        update.company = resolved.company || target.company || (role === 'productora' ? myCompany : '');
        update.assigned_event_ids = resolved.bar.event_id ? [resolved.bar.event_id] : (target.assigned_event_ids || []);
      }
      if (body.blocked !== undefined) update.blocked = !!body.blocked;
      await base44.asServiceRole.entities.User.update(userId, update);
      return Response.json({ ok: true });
    }

    // ---------- PASSWORD ----------
    if (action === 'password') {
      const userId = (body.user_id || '').toString();
      const newPassword = (body.newPassword || '').toString();
      if (!userId || !newPassword || newPassword.length < 6) {
        return Response.json({ error: 'user_id y newPassword (mínimo 6 caracteres) son obligatorios' }, { status: 400 });
      }
      const found = await base44.asServiceRole.entities.User.filter({ id: userId });
      if (!found || !found.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
      const target = found[0];
      const tRole = target.role || (target.data && target.data.role);
      if (tRole !== 'barra') return Response.json({ error: 'El usuario no es operador de barra' }, { status: 400 });
      if (!scopeOk(target.company || (target.data && target.data.company) || '')) {
        return Response.json({ error: 'El operador no pertenece a tu empresa' }, { status: 403 });
      }
      await base44.auth.changePassword({ userId, newPassword });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al gestionar operador de barra' }, { status: 500 });
  }
}