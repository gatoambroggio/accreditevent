// Revoca todos los biométricos activos de una persona (no los borra).
export async function clearBiometrics({ person_id }, { user, prisma }) {
  if (!person_id) throw Object.assign(new Error('Falta person_id'), { status: 400 });
  const existing = await prisma.biometric.findMany({ where: { person_id, status: 'active' } });
  for (const b of existing) await prisma.biometric.update({ where: { id: b.id }, data: { status: 'revoked' } });
  await prisma.accreditation.updateMany({ where: { person_id }, data: { has_biometric: false } }).catch(() => {});
  return { success: true, revoked: existing.length };
}