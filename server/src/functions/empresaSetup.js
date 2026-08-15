export async function empresaSetup({ company_name, contact_phone, contact_email, description }, { user, prisma }) {
  if (!company_name) throw Object.assign(new Error('El nombre de la empresa es obligatorio'), { status: 400 });
  const existing = await prisma.providerCompany.findMany({ where: { name: company_name } });
  let company;
  if (existing.length) {
    company = existing[0];
    await prisma.providerCompany.update({ where: { id: company.id }, data: { contact_phone: contact_phone || company.contact_phone, contact_email: contact_email || company.contact_email, description: description || company.description } });
  } else {
    company = await prisma.providerCompany.create({ data: { name: company_name, description: description || '', contact_phone: contact_phone || '', contact_email: contact_email || '' } });
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'empresa', data: { ...(user.data || {}), company: company.name } } });
  await prisma.auditLog.create({ data: { actor_name: company.name, actor_id: user.id, action: 'empresa-register', entity: 'ProviderCompany', entity_id: company.id, detail: company.name } });
  return { company_id: company.id, company_name: company.name };
}