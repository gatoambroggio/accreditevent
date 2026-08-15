export async function reviewDocument({ document_id, status, expires_at, review_note, custom_fields }, { user, prisma }) {
  if (!document_id) throw Object.assign(new Error('document_id requerido'), { status: 400 });
  const doc = await prisma.document.findUnique({ where: { id: document_id } });
  if (!doc) throw Object.assign(new Error('Documento no encontrado'), { status: 404 });

  const userCompany = user?.data?.company || '';
  const assignedEventIds = user?.data?.assigned_event_ids || [];
  const role = user.role;
  let authorized = ['superadmin', 'admin', 'coordinator'].includes(role);
  if (!authorized && role === 'productora') {
    if (doc.event_id && assignedEventIds.includes(doc.event_id)) authorized = true;
    if (!authorized && doc.company && doc.company === userCompany) authorized = true;
    if (!authorized && doc.company) {
      const approvals = await prisma.eventCompanyApproval.findMany({ where: { company: userCompany } });
      const providers = new Set(approvals.map((a) => a.provider_company).filter(Boolean));
      authorized = providers.has(doc.company);
    }
    if (!authorized && doc.person_id) {
      const person = await prisma.person.findUnique({ where: { id: doc.person_id } });
      if (person?.productora === userCompany) authorized = true;
      if (!authorized && person?.event_id && assignedEventIds.includes(person.event_id)) authorized = true;
    }
    if (!authorized && doc.created_by_id === user.id) authorized = true;
  }
  if (!authorized) throw Object.assign(new Error('No tenés permiso para revisar este documento'), { status: 403 });

  const update = { status, review_note: review_note || '', reviewed_by: user?.full_name || user?.email || '', reviewed_at: new Date() };
  if (expires_at !== undefined) update.expires_at = expires_at ? new Date(expires_at) : null;
  if (custom_fields !== undefined) update.custom_fields = custom_fields;
  const updated = await prisma.document.update({ where: { id: document_id }, data: update });
  return { success: true, document: updated };
}