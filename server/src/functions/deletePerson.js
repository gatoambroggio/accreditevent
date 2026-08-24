// Eliminación en cascada de persona + todos sus registros relacionados.
export async function deletePerson({ person_id }, { user, prisma }) {
  if (!person_id) throw Object.assign(new Error('Falta person_id'), { status: 400 });
  const person = await prisma.person.findUnique({ where: { id: person_id } });
  if (!person) throw Object.assign(new Error('Persona no encontrada'), { status: 404 });
  const userCompany = user?.data?.company || '';
  const allowed = ['superadmin', 'admin', 'coordinator'].includes(user.role) || (user.role === 'productora' && person.productora === userCompany) || (user.role === 'empresa' && person.company === userCompany);
  if (!allowed) throw Object.assign(new Error('No autorizado para eliminar esta persona'), { status: 403 });

  const accredIds = [];
  let skip = 0;
  while (true) {
    const batch = await prisma.accreditation.findMany({ where: { person_id }, skip, take: 500 });
    accredIds.push(...batch.map((a) => a.id));
    if (batch.length < 500) break;
    skip += 500;
    if (skip > 10000) break;
  }
  await Promise.all([
    prisma.biometric.deleteMany({ where: { person_id } }),
    prisma.document.deleteMany({ where: { person_id } }),
    prisma.vehicle.deleteMany({ where: { person_id } }),
    prisma.zkTecoCommand.deleteMany({ where: { person_id } }),
    prisma.dahuaCommand.deleteMany({ where: { person_id } }),
    prisma.accreditation.deleteMany({ where: { person_id } }),
    prisma.providerRequest.deleteMany({ where: { person_id } }),
    prisma.auditLog.deleteMany({ where: { entity_id: person_id } }),
    ...accredIds.map((id) => prisma.accessLog.deleteMany({ where: { accreditation_id: id } })),
  ]);
  await prisma.person.delete({ where: { id: person_id } });
  await prisma.auditLog.create({ data: { actor_name: user.full_name || user.email, actor_id: user.id, action: 'delete-person-cascade', entity: 'Person', entity_id: person_id, detail: `${person.full_name} — eliminado con todo` } });
  return { success: true, person_name: person.full_name };
}