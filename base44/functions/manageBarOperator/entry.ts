import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ALLOWED_ROLES = ['superadmin', 'admin', 'productora'];

// Deriva el email real de un operador a partir de la plantilla configurada
// en SystemSetting.bar_email_template (ej. "barras+{u}@ipx.com.ar" + "B1" ->
// "barras+b1@ipx.com.ar"). {u} es el placeholder del usuario libre.
function deriveEmail(template, username) {
  const u = (username || '').toString().trim().toLowerCase();
  return (template || '').toString().replace(/\{u\}/g, u);
}

// Extrae el usuario libre visible a partir del email real (best-effort).
// Para plantillas con plus-addressing (barras+b1@...) devuelve "b1".
function usernameFromEmail(email) {
  if (!email) return '';
  const local = String(email).split('@')[0] || '';
  const plusIdx = local.indexOf('+');
  return plusIdx >= 0 ? local.slice(plusIdx + 1) : local;
}

async function readBarTemplate(base44) {
  const all = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
  return (all && all[0] && all[0].bar_email_template) || '';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'list').toString();

    // ---------- Public: getTemplate ----------
    // Devuelve la plantilla de email de barras para que /bar-app pueda derivar
    // el email de login del operador. No requiere auth (no expone secretos).
    if (action === 'getTemplate') {
      const template = await readBarTemplate(base44);
      return Response.json({ ok: true, template: template || '' });
    }

    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = caller.role || (caller.data && caller.data.role);
    if (!ALLOWED_ROLES.includes(role)) {
      return Response.json({ error: 'No tenés permisos para gestionar operadores de barra' }, { status: 403 });
    }
    const myCompany = (caller.company || (caller.data && caller.data.company) || '').toString();

    const scopeOk = (company) => {
      if (role !== 'productora') return true;
      if (!myCompany) return false;
      return (company || '').toUpperCase() === myCompany.toUpperCase();
    };

    async function resolveBar(barId) {
      if (!barId) return null;
      let bars;
      try { bars = await base44.asServiceRole.entities.Bar.filter({ id: barId }); }
      catch { return null; }
      if (!bars || !bars.length) return null;
      const bar = bars[0];
      let event = null;
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
      const all = await base44.asServiceRole.entities.User.filter({ role: 'barra' }, '-created_date', 500);
      let ops = (all || []).map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        username: u.full_name || usernameFromEmail(u.email),
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
      if (!/^[a-z0-9._+-]+$/i.test(username)) {
        return Response.json({ error: 'El usuario sólo puede tener letras, números, punto, guión o guión bajo' }, { status: 400 });
      }
      const template = await readBarTemplate(base44);
      if (!template || template.indexOf('{u}') === -1) {
        return Response.json({ error: 'Falta configurar la plantilla de email de barras en Configuración (usá {u} como placeholder del usuario).' }, { status: 400 });
      }
      const email = deriveEmail(template, username);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return Response.json({ error: 'El email derivado no es válido: ' + email }, { status: 400 });
      }
      const resolved = await resolveBar(barId);
      if (!resolved) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
      const { bar, event, company } = resolved;
      if (!scopeOk(company)) {
        return Response.json({ error: 'La barra no pertenece a tu empresa' }, { status: 403 });
      }

      const assignedEventIds = bar.event_id ? [bar.event_id] : [];
      const operatorCompany = company || (role === 'productora' ? myCompany : '');

      // ¿Ya existe como usuario registrado? -> aplicar rol barra + barra asignada
      // y setear la contraseña directamente (no necesita invitación).
      const existing = await base44.asServiceRole.entities.User.filter({ email });
      if (existing && existing.length) {
        const ex = existing[0];
        const exRole = ex.role || (ex.data && ex.data.role);
        if (exRole && !['barra', 'user'].includes(exRole)) {
          return Response.json({ error: 'Ya existe un usuario con ese nombre y tiene otro rol' }, { status: 400 });
        }
        const patch = {
          role: 'barra',
          full_name: username,
          bar_id: barId,
          bar_event_id: bar.event_id || '',
          company: operatorCompany,
          assigned_event_ids: assignedEventIds,
        };
        await base44.asServiceRole.entities.User.update(ex.id, patch);
        let pwWarning = '';
        try { await base44.auth.changePassword({ userId: ex.id, newPassword: password }); }
        catch (e) { pwWarning = 'No se pudo setear la contraseña: ' + (e.message || e); }
        return Response.json({ ok: true, existing: true, user: { id: ex.id, email, username }, passwordWarning: pwWarning });
      }

      // No existe: guardamos la asignación pendiente (con la contraseña a aplicar
      // al confirmar) e invitamos al email compartido. El admin debe abrir esa
      // invitación en el inbox compartido y completar el registro una vez; al
      // registrarse, el workflow aplica rol barra + bar_id + contraseña.
      const pendingData = {
        email,
        company: operatorCompany,
        desired_role: 'barra',
        assigned_event_ids: assignedEventIds,
        allowed_paths: [],
        invite_url: '',
        status: 'pending',
        bar_id: barId,
        bar_event_id: bar.event_id || '',
        bar_username: username,
        bar_password: password,
      };
      const pendExisting = await base44.asServiceRole.entities.PendingOperator.filter({ email, status: 'pending' });
      if (pendExisting && pendExisting.length) {
        await base44.asServiceRole.entities.PendingOperator.update(pendExisting[0].id, pendingData);
      } else {
        await base44.asServiceRole.entities.PendingOperator.create(pendingData);
      }

      let inviteError = '';
      try {
        await base44.users.inviteUser(email, 'user');
      } catch (e) {
        const msg = (e.message || '').toLowerCase();
        if (msg.includes('ya') || msg.includes('exist') || msg.includes('registrad') || msg.includes('already')) {
          // ya invitado/registrado: no es bloqueante
        } else {
          inviteError = e.message || String(e);
        }
      }

      return Response.json({
        ok: true,
        pending: true,
        email,
        username,
        message: `Se envió la invitación a ${email}. Abrí ese email en el inbox compartido y completá el registro una vez; al hacerlo, el operador queda activo con su contraseña.`,
        inviteError,
      });
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