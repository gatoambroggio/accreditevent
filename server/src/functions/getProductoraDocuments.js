export async function getProductoraDocuments(_payload, { user, prisma }) {
  const userCompany = user?.data?.company || '';
  const productoraEvents = await prisma.event.findMany({ where: { company: userCompany }, orderBy: { start_at: 'desc' }, take: 200 });
  const productoraEventIds = productoraEvents.map((e) => e.id);
  const approvals = await prisma.eventCompanyApproval.findMany({ where: { company: userCompany } });
  const providerCompanies = Array.from(new Set(approvals.map((a) => a.provider_company).filter(Boolean)));
  const [eventDocs, companyDocs] = await Promise.all([
    productoraEventIds.length ? prisma.document.findMany({ where: { event_id: { in: productoraEventIds } }, orderBy: { created_at: 'desc' }, take: 500 }) : [],
    providerCompanies.length ? prisma.document.findMany({ where: { company: { in: providerCompanies } }, orderBy: { created_at: 'desc' }, take: 500 }) : [],
  ]);
  const seen = new Set(), docs = [];
  for (const d of [...eventDocs, ...companyDocs]) { if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); } }
  return { documents: docs, provider_companies: providerCompanies, event_ids: productoraEventIds };
}