import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const email = (body && body.email ? body.email : '').toString().trim().toLowerCase();
    const userId = (body && body.user_id ? body.user_id : '').toString().trim();
    if (!email) {
      return Response.json({ ok: false, skipped: true, reason: 'missing email' });
    }

    // Auth: el llamador debe estar autenticado y procesar su propia invitación
    // (flujo de signup) o tener rol de administración.
    const caller = await base44.auth.me().catch(() => null);
    if (!caller) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const callerEmail = (caller.email || '').toString().trim().toLowerCase();
    const callerRole = caller.role || (caller.data && caller.data.role) || '';
    const isSelf = callerEmail && callerEmail === email;
    const isManager = ['superadmin', 'admin'].includes(callerRole);
    if (!isSelf && !isManager) {
      return Response.json({ error: 'No autorizado para procesar esta asignación' }, { status: 403 });
    }

    const pending = await base44.asServiceRole.entities.PendingOperator.filter({ email, status: 'pending' });
    if (!pending.length) {
      return Response.json({ ok: true, processed: false, reason: 'no pending assignment' });
    }

    const assignment = pending[0];
    const company = (assignment.company || '').toUpperCase();

    const userRecord = await base44.asServiceRole.entities.User.filter({ email });
    if (!userRecord.length) {
      return Response.json({ ok: false, skipped: true, reason: 'user not found' });
    }
    const target = userRecord[0];
    const currentRole = target.role || (target.data && target.data.role);
    if (['productora', 'admin', 'superadmin'].includes(currentRole)) {
      await base44.asServiceRole.entities.PendingOperator.update(assignment.id, { status: 'processed' });
      return Response.json({ ok: true, processed: false, reason: 'user has superior role' });
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

    await base44.asServiceRole.entities.PendingOperator.update(assignment.id, { status: 'processed' });

    return Response.json({ ok: true, processed: true, user: { id: target.id, email: target.email, role: 'operador', company } });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al procesar operador pendiente' }, { status: 500 });
  }
}