const DUPLICATE_THRESHOLD = 0.5;
function euclidean(a, b) { if (!a || !b || a.length !== b.length) return Infinity; let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }

export async function checkFaceDuplicate({ face_descriptor, person_id }, { user, prisma }) {
  if (!Array.isArray(face_descriptor) || face_descriptor.length === 0) throw Object.assign(new Error('face_descriptor obligatorio'), { status: 400 });
  const userCompany = user?.data?.company || '';
  const isScoped = user.role === 'productora' && userCompany;
  const where = isScoped ? { status: 'active', company: userCompany } : { status: 'active' };
  const bios = await prisma.biometric.findMany({ where, orderBy: { created_at: 'desc' }, take: 10000 });
  const duplicates = [];
  for (const b of bios) {
    if (person_id && b.person_id === person_id) continue;
    if (!b.face_descriptor?.length) continue;
    const dist = euclidean(face_descriptor, b.face_descriptor);
    if (dist < DUPLICATE_THRESHOLD) duplicates.push({ biometric_id: b.id, person_id: b.person_id, person_name: b.person_name, event_id: b.event_id, distance: Math.round(dist * 1000) / 1000 });
  }
  return { is_duplicate: duplicates.length > 0, duplicates };
}