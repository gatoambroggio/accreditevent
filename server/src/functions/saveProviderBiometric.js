const DUPLICATE_THRESHOLD = 0.5;
function euclidean(a, b) { if (!a || !b || a.length !== b.length) return Infinity; let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }

export async function saveProviderBiometric({ person_id, person_name, event_id, face_photo_url, face_descriptor }, { user, prisma }) {
  const tenant = user?.data?.company || '';
  if (!tenant) throw Object.assign(new Error('Tu usuario no tiene una productora asignada'), { status: 403 });
  if (!person_id || !face_photo_url) throw Object.assign(new Error('Faltan datos requeridos'), { status: 400 });
  let company = tenant;
  if (event_id) { const event = await prisma.event.findUnique({ where: { id: event_id } }); if (event?.company) company = event.company; }

  if (Array.isArray(face_descriptor) && face_descriptor.length) {
    const tenantBios = await prisma.biometric.findMany({ where: { company: tenant, status: 'active' }, take: 500 });
    for (const b of tenantBios) {
      if (b.person_id === person_id) continue;
      if (!b.face_descriptor?.length || b.face_descriptor.length !== face_descriptor.length) continue;
      const dist = euclidean(face_descriptor, b.face_descriptor);
      if (dist < DUPLICATE_THRESHOLD) throw Object.assign(new Error(`Este rostro ya está registrado para "${b.person_name}"`), { status: 409 });
    }
  }
  const existing = await prisma.biometric.findMany({ where: { person_id, status: 'active' }, take: 50 });
  for (const b of existing) await prisma.biometric.update({ where: { id: b.id }, data: { status: 'revoked' } });
  const biometric = await prisma.biometric.create({ data: { person_id, person_name, event_id: event_id || null, company, face_photo_url, face_descriptor: face_descriptor || [], status: 'active' } });
  await prisma.accreditation.updateMany({ where: { person_id }, data: { has_biometric: true } }).catch(() => {});
  return { biometric_id: biometric.id };
}