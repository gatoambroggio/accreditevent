// Borra documentos en lote, con scope de productora.
export async function deleteDocuments({ document_ids }, { user, prisma }) {
  if (!Array.isArray(document_ids) || document_ids.length === 0) throw Object.assign(new Error('No se enviaron documentos'), { status: 400 });
  const tenant = user?.data?.company || '';
  const role = user.role;
  let allowedEventIds = new Set(), allowedCompanies = new Set();
  if (role === 'productora') {
    if (!tenant) throw Object.assign(new Error('Sin productora asignada'), { status: 403 });
    const [events, approvals] = await Promise.all([
      prisma.event.findMany({ where: { company: tenant } }),
      prisma.eventCompanyApproval.findMany({ where: { company: tenant } }),
    ]);
    allowedEventIds = new Set(events.map((e) => e.id));
    allowedCompanies = new Set([tenant, ...approvals.map((a) => a.provider_company).filter(Boolean)]);
  }
  const deleted = [], denied = [];
  for (const id of document_ids) {
    try {
      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) { denied.push({ id, reason: 'No encontrado' }); continue; }
      if (role === 'productora') {
        const ok = allowedCompanies.has(doc.company) || (doc.event_id && allowedEventIds.has(doc.event_id)) || doc.created_by_id === user.id;
        if (!ok) { denied.push({ id, reason: 'Fuera de tu productora' }); continue; }
      }
      await prisma.document.delete({ where: { id } });
      deleted.push(id);
    } catch (e) { denied.push({ id, reason: e.message }); }
  }
  return { deleted, denied, deleted_count: deleted.length };
}