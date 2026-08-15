export async function processPendingOperators({ email, user_id }, { user, prisma }) {
  email = (email || '').toString().trim().toLowerCase();
  if (!email) return { ok: false, skipped: true, reason: 'missing email' };
  const callerEmail = (user.email || '').toLowerCase();
  const isSelf = callerEmail === email;
  const isManager = ['superadmin', 'admin'].includes(user.role);
  if (!isSelf && !isManager) throw Object.assign(new Error('No autorizado para procesar esta asignación'), { status: 403 });

  const pending = await prisma.pendingOperator.findMany({ where: { email, status: 'pending' } });
  if (!pending.length) return { ok: true, processed: false, reason: 'no pending assignment' };
  const assignment = pending[0];
  const company = (assignment.company || '').toUpperCase();
  const desiredRole = assignment.desired_role || 'operador';
  const assignedEventIds = assignment.assigned_event_ids || [];
  const allowedPaths = assignment.allowed_paths || [];

  const userRecord = await prisma.user.findMany({ where: { email } });
  if (!userRecord.length) return { ok: false, skipped: true, reason: 'user not found' };
  const target = userRecord[0];
  if (['productora', 'admin', 'superadmin'].includes(target.role)) {
    await prisma.pendingOperator.update({ where: { id: assignment.id }, data: { status: 'processed' } });
    return { ok: true, processed: false, reason: 'user has superior role' };
  }
  await prisma.user.update({ where: { id: target.id }, data: { role: desiredRole, data: { ...((target.data || {})), company, assigned_event_ids: assignedEventIds, allowed_paths: allowedPaths } } });
  if (company) {
    const comps = await prisma.company.findMany({ where: { name: company } });
    if (comps.length && !(comps[0].assigned_user_ids || []).includes(target.id)) await prisma.company.update({ where: { id: comps[0].id }, data: { assigned_user_ids: [...(comps[0].assigned_user_ids || []), target.id] } });
  }
  await prisma.pendingOperator.update({ where: { id: assignment.id }, data: { status: 'processed' } });
  return { ok: true, processed: true, user: { id: target.id, email, role: desiredRole, company } };
}