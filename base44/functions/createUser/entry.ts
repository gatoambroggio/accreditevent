import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PDA_DEFAULT_PATHS = ['/access-control', '/control-qr', '/control-vehicular', '/control-manual', '/pda-id', '/emergency-scan'];

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
    const company = (body.company || '').toString().trim().toUpperCase();
    const assigned_event_ids = Array.isArray(body.assigned_event_ids) ? body.assigned_event_ids : [];
    let allowed_paths = Array.isArray(body.allowed_paths) ? body.allowed_paths : [];
    if (newRole === 'pda' && allowed_paths.length === 0) allowed_paths = PDA_DEFAULT_PATHS;
    const setTempPassword = !!body.setTempPassword;
    const tempPassword = (body.tempPassword || '').toString();

    if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });
    if (setTempPassword && tempPassword.length < 6) {
      return Response.json({ error: 'La contraseña temporal debe tener al menos 6 caracteres' }, { status: 400 });
    }

    let origin = req.headers.get('origin');
    if (!origin) {
      const referer = req.headers.get('referer');
      try { origin = referer ? new URL(referer).origin : null; } catch {}
    }
    const inviteUrl = origin ? `${origin}/register?email=${encodeURIComponent(email)}` : '';

    const patch = { role: newRole, assigned_event_ids, allowed_paths };
    if (company) patch.company = company;

    // ¿Ya existe como usuario registrado? Lo configuramos directamente.
    const existing = await base44.asServiceRole.entities.User.filter({ email });
    if (existing && existing.length) {
      const target = existing[0];
      const currentRole = target.role || (target.data && target.data.role);
      if (['productora', 'admin', 'superadmin'].includes(currentRole)) {
        return Response.json({ error: 'Ya existe un usuario con ese email y tiene un rol superior. Editálo desde la lista.' }, { status: 400 });
      }
      await base44.asServiceRole.entities.User.update(target.id, patch);
      if (fullName) {
        try { await base44.asServiceRole.entities.User.update(target.id, { full_name: fullName }); } catch {}
      }
      let passwordWarning = '';
      if (setTempPassword && tempPassword.length >= 6) {
        try { await base44.auth.changePassword({ userId: target.id, newPassword: tempPassword }); }
        catch (e) { passwordWarning = 'No se pudo setear la contraseña temporal.'; }
      }
      if (company) await linkCompany(base44, target.id, company);
      return Response.json({ ok: true, pending: false, user: { id: target.id, email, role: newRole, company }, passwordWarning });
    }

    // No está registrado: guardamos la asignación pendiente con todos los datos
    // (rol, empresa, eventos, módulos) y enviamos la invitación. La entidad User
    // se crea recién cuando la persona completa el registro; en ese momento el
    // workflow "Asignar Operadores Pendientes" aplica todo automáticamente. La
    // asignación queda visible en la sección "Invitaciones pendientes" del panel.
    const pendingData = {
      email, company: company || '', desired_role: newRole,
      assigned_event_ids, allowed_paths, invite_url: inviteUrl, status: 'pending',
    };
    const pendingExisting = await base44.asServiceRole.entities.PendingOperator.filter({ email, status: 'pending' });
    if (pendingExisting.length) {
      await base44.asServiceRole.entities.PendingOperator.update(pendingExisting[0].id, pendingData);
    } else {
      await base44.asServiceRole.entities.PendingOperator.create(pendingData);
    }

    try {
      await base44.users.inviteUser(email, 'user');
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (!msg.includes('ya') && !msg.includes('exist') && !msg.includes('registrad') && !msg.includes('already')) {
        return Response.json({ error: 'No se pudo invitar al usuario: ' + (e.message || e) }, { status: 500 });
      }
    }

    const roleLabel = { pda: 'PDA', operador: 'operador', control: 'control', coordinator: 'coordinador', provider: 'proveedor', empresa: 'empresa' }[newRole] || newRole;
    return Response.json({
      ok: true,
      pending: true,
      invite_url: inviteUrl,
      message: `La invitación fue enviada a ${email}. Quedó registrada en "Invitaciones pendientes" como ${roleLabel}${company ? ' de ' + company : ''} con los eventos y módulos asignados. Cuando la persona complete su registro desde el email, se activará automáticamente.${inviteUrl ? ' Si el email no llega, compartí este link: ' + inviteUrl : ''}`
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al crear usuario' }, { status: 500 });
  }
}

async function linkCompany(base44, userId, companyName) {
  try {
    const comps = await base44.asServiceRole.entities.Company.filter({ name: companyName });
    if (comps.length) {
      const c = comps[0];
      if (!(c.assigned_user_ids || []).includes(userId)) {
        await base44.asServiceRole.entities.Company.update(c.id, { assigned_user_ids: [...(c.assigned_user_ids || []), userId] });
      }
    }
  } catch {}
}