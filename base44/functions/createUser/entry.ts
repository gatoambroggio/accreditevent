import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PDA_DEFAULT_PATHS = ['/access-control', '/pda-id', '/emergency-scan'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    if (!['superadmin', 'admin'].includes(role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = (body.email || '').toString().trim().toLowerCase();
    const newRole = (body.role || 'user').toString();
    const fullName = (body.full_name || '').toString().trim();
    const company = (body.company || '').toString().trim();
    const assigned_event_ids = Array.isArray(body.assigned_event_ids) ? body.assigned_event_ids : [];
    let allowed_paths = Array.isArray(body.allowed_paths) ? body.allowed_paths : [];
    if (newRole === 'pda' && allowed_paths.length === 0) allowed_paths = PDA_DEFAULT_PATHS;
    const setTempPassword = !!body.setTempPassword;
    const tempPassword = (body.tempPassword || '').toString();

    if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });
    if (setTempPassword && tempPassword.length < 6) {
      return Response.json({ error: 'La contraseña temporal debe tener al menos 6 caracteres' }, { status: 400 });
    }

    // ¿Ya existe un usuario con ese email?
    const existing = await base44.asServiceRole.entities.User.filter({ email });
    if (existing && existing.length) {
      return Response.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 });
    }

    // Invitar (crea el usuario en la plataforma y envía email)
    try {
      await base44.asServiceRole.users.inviteUser(email, newRole);
    } catch (e) {
      return Response.json({ error: 'No se pudo invitar al usuario: ' + (e.message || e) }, { status: 500 });
    }

    // Recuperar el id del usuario recién creado (reintentos por eventual consistencia)
    let target = null;
    for (let i = 0; i < 6 && !target; i++) {
      const recs = await base44.asServiceRole.entities.User.filter({ email });
      if (recs && recs.length) target = recs[0];
      if (!target) await new Promise((r) => setTimeout(r, 400));
    }

    if (!target) {
      return Response.json({ ok: true, pending: true, message: 'La invitación fue enviada por email. El usuario deberá completar su registro desde el link enviado.' });
    }

    // Setear metadata (company, eventos asignados, módulos permitidos)
    const patch = { assigned_event_ids, allowed_paths };
    if (company) patch.company = company;
    await base44.asServiceRole.entities.User.update(target.id, patch);

    // Intentar setear el nombre por separado (full_name es built-in; puede no ser asignable)
    if (fullName) {
      try { await base44.asServiceRole.entities.User.update(target.id, { full_name: fullName }); } catch {}
    }

    // Contraseña temporal (opcional). Si falla (p.ej. el usuario aún no completó el
    // registro en la plataforma), no abortamos: el alta igual quedó hecha y el email
    // de invitación sigue siendo válido.
    let passwordWarning = '';
    if (setTempPassword && tempPassword.length >= 6) {
      try {
        await base44.auth.changePassword({ userId: target.id, newPassword: tempPassword });
      } catch (e) {
        passwordWarning = 'No se pudo setear la contraseña temporal (es posible que el usuario deba completar el registro desde el email enviado).';
      }
    }

    // Sincronizar Company.assigned_user_ids
    if (company) {
      try {
        const comps = await base44.asServiceRole.entities.Company.filter({ name: company });
        if (comps.length) {
          const c = comps[0];
          if (!(c.assigned_user_ids || []).includes(target.id)) {
            await base44.asServiceRole.entities.Company.update(c.id, {
              assigned_user_ids: [...(c.assigned_user_ids || []), target.id],
            });
          }
        }
      } catch {}
    }

    return Response.json({ ok: true, user: { id: target.id, email, role: newRole, company }, passwordWarning });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al crear usuario' }, { status: 500 });
  }
}