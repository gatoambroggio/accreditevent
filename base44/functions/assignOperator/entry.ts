import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    if (!['productora', 'admin', 'superadmin'].includes(role)) {
      return Response.json({ error: 'No tenés permisos para asignar operadores' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = (body && body.email ? body.email : '').toString().trim().toLowerCase();
    if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });

    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();
    if (role === 'productora' && !company) {
      return Response.json({ error: 'Tu usuario no tiene una empresa asignada' }, { status: 400 });
    }

    const found = await base44.asServiceRole.entities.User.filter({ email });
    if (!found.length) {
      // Link de registro prellenado para compartir manualmente si el email no llega
      let origin = req.headers.get('origin');
      if (!origin) {
        const referer = req.headers.get('referer');
        try { origin = referer ? new URL(referer).origin : null; } catch {}
      }
      const inviteUrl = origin ? `${origin}/register?email=${encodeURIComponent(email)}` : '';

      // Reutilizar registro pendiente existente si ya fue invitado
      const existingPending = await base44.asServiceRole.entities.PendingOperator.filter({ email, company, status: 'pending' });
      if (existingPending.length) {
        await base44.asServiceRole.entities.PendingOperator.update(existingPending[0].id, { invite_url: inviteUrl });
      } else {
        await base44.asServiceRole.entities.PendingOperator.create({ email, company, status: 'pending', invite_url: inviteUrl });
      }
      try {
        await base44.asServiceRole.users.inviteUser(email, 'user');
      } catch (inviteErr) {
        const msg = (inviteErr.message || '').toLowerCase();
        if (!msg.includes('ya') && !msg.includes('exist') && !msg.includes('registrad') && !msg.includes('already')) {
          console.warn('No se pudo enviar invitación por email:', inviteErr.message || inviteErr);
        }
      }
      return Response.json({
        ok: true,
        pending: true,
        invite_url: inviteUrl,
        message: 'La invitación fue enviada. Cuando la persona complete su registro, quedará automáticamente vinculada como operador de tu empresa. Compartí este link si el email no llega: ' + inviteUrl
      });
    }
    const target = found[0];
    const targetRole = target.role || (target.data && target.data.role);
    if (['productora', 'admin', 'superadmin'].includes(targetRole)) {
      return Response.json({ error: 'No se puede asignar como operador a un usuario con rol superior' }, { status: 400 });
    }

    await base44.asServiceRole.entities.User.update(target.id, { role: 'operador', company });

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

    return Response.json({ ok: true, pending: false, user: { id: target.id, email: target.email, role: 'operador', company } });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al asignar operador' }, { status: 500 });
  }
}