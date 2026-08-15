export async function providerSetup(body, { user, prisma }) {
  if (!body.full_name || !body.event_id) throw Object.assign(new Error('Faltan campos (full_name, event_id)'), { status: 400 });
  const event = await prisma.event.findUnique({ where: { id: body.event_id } });
  const productora = event?.company || '';
  if (body.document) {
    const normalizedDoc = String(body.document).replace(/\D/g, '');
    if (normalizedDoc) {
      const docMatches = await prisma.person.findMany({ where: { document: normalizedDoc }, take: 50 });
      const docDup = docMatches.find((p) => p.email !== body.email);
      if (docDup) throw Object.assign(new Error(`Ya existe una persona con ese DNI: ${docDup.full_name}`), { status: 409 });
    }
  }
  const existing = await prisma.person.findMany({ where: { email: body.email } });
  let person;
  if (existing.length) {
    person = existing[0];
    await prisma.person.update({ where: { id: person.id }, data: { full_name: body.full_name, document: body.document, company: body.company, productora, phone: body.phone, person_type: 'provider', tipo_vinculo: 'empresa', status: 'active', event_id: body.event_id } });
  } else {
    person = await prisma.person.create({ data: { full_name: body.full_name, document: body.document, company: body.company, productora, phone: body.phone, email: body.email, person_type: 'provider', tipo_vinculo: 'empresa', status: 'active', event_id: body.event_id } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'provider' } });
  await prisma.auditLog.create({ data: { actor_name: body.full_name || user.email, actor_id: user.id, action: 'provider-self-register', entity: 'Person', entity_id: person.id, detail: body.company || '' } });
  return { person_id: person.id };
}