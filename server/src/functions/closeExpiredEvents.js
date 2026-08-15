// Cierra eventos vencidos (pasado el grace_hours) y borra sus acreditaciones.
export async function closeExpiredEvents(_payload, { user, prisma }) {
  if (!['superadmin', 'admin'].includes(user.role)) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const now = Date.now();
  const events = await prisma.event.findMany({ where: { status: 'active' } });
  const expired = events.filter((e) => { if (!e.end_at) return false; const end = new Date(e.end_at).getTime(); if (isNaN(end)) return false; return now > end + (e.grace_hours ?? 4) * 3600000; });
  let closed = 0, accreditationsDeleted = 0;
  for (const e of expired) {
    await prisma.event.update({ where: { id: e.id }, data: { status: 'closed' } }).catch(() => {}); closed++;
    const accs = await prisma.accreditation.findMany({ where: { event_id: e.id } });
    if (accs.length) { await prisma.accreditation.deleteMany({ where: { event_id: e.id } }); accreditationsDeleted += accs.length; }
  }
  return { closed, accreditations_deleted: accreditationsDeleted, total_checked: events.length, expired_found: expired.length };
}