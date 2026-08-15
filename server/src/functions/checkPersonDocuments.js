export async function checkPersonDocuments({ person_id, event_id }, { prisma }) {
  if (!person_id) throw Object.assign(new Error('person_id requerido'), { status: 400 });
  const person = await prisma.person.findUnique({ where: { id: person_id } });
  const tipoVinculo = person?.tipo_vinculo || (person?.company ? 'empresa' : 'autonomo');

  let hasBiometric = false;
  const bios = await prisma.biometric.findMany({ where: { person_id, status: 'active' }, take: 1 });
  hasBiometric = bios.length > 0;

  if (tipoVinculo === 'empresa') {
    const eventIds = [];
    if (event_id) eventIds.push(event_id);
    else { if (person.event_id) eventIds.push(person.event_id); if (Array.isArray(person.event_ids)) eventIds.push(...person.event_ids); }
    if (eventIds.length > 0) {
      const approvals = await prisma.eventCompanyApproval.findMany({ where: { provider_company: person.company, status: 'approved' } });
      const approved = new Set(approvals.map((a) => a.event_id));
      const hasApproved = eventIds.some((eid) => approved.has(eid));
      return { has_pending: !hasApproved, pending_count: hasApproved ? 0 : 1, pending_statuses: hasApproved ? [] : ['company_not_approved'], has_biometric: hasBiometric };
    }
    const docs = await prisma.document.findMany({ where: { person_id } });
    const hasRejected = docs.some((d) => d.document_type === 'work_insurance' && d.status === 'rejected');
    return { has_pending: hasRejected, pending_count: hasRejected ? 1 : 0, pending_statuses: hasRejected ? ['rejected'] : [], has_biometric: hasBiometric };
  }

  const docs = await prisma.document.findMany({ where: { person_id } });
  const now = new Date();
  if (docs.length === 0) return { has_pending: true, pending_count: 0, pending_statuses: ['no_documents'], has_biometric: hasBiometric };
  const isValid = (d) => d.status === 'approved' && (!d.expires_at || new Date(d.expires_at) >= now);
  const byType = {};
  docs.forEach((d) => { (byType[d.document_type || 'other'] ||= []).push(d); });
  const pending = Object.entries(byType).filter(([, td]) => !td.some(isValid)).map(([type, td]) => ({ type, statuses: [...new Set(td.map((d) => d.status === 'approved' ? 'expired' : d.status))] }));
  return { has_pending: pending.length > 0, pending_count: pending.length, pending_statuses: pending.flatMap((t) => t.statuses), has_biometric: hasBiometric };
}