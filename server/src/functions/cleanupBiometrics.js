const DUPLICATE_THRESHOLD = 0.5;
function euclidean(a, b) { if (!a || !b || a.length !== b.length) return Infinity; let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }

export async function cleanupBiometrics(_payload, { user, prisma }) {
  if (!['superadmin', 'admin'].includes(user.role)) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const report = { orphaned_deleted: 0, no_descriptor_deleted: 0, revoked_deleted: 0, pending_deleted: 0, multi_active_per_person_deleted: 0, cross_person_duplicate_deleted: 0, has_biometric_updated: 0, details: [] };
  const [biometrics, persons] = await Promise.all([
    prisma.biometric.findMany({ orderBy: { created_at: 'desc' }, take: 20000 }),
    prisma.person.findMany({ take: 20000 }),
  ]);
  const personIds = new Set(persons.map((p) => p.id));

  for (const b of biometrics.filter((b) => b.person_id && !personIds.has(b.person_id))) { try { await prisma.biometric.delete({ where: { id: b.id } }); report.orphaned_deleted++; } catch {} }
  for (const b of biometrics.filter((b) => !b.face_descriptor?.length)) { try { await prisma.biometric.delete({ where: { id: b.id } }); report.no_descriptor_deleted++; } catch {} }
  for (const b of biometrics.filter((b) => b.status === 'revoked')) { try { await prisma.biometric.delete({ where: { id: b.id } }); report.revoked_deleted++; } catch {} }
  for (const b of biometrics.filter((b) => b.status === 'pending')) { try { await prisma.biometric.delete({ where: { id: b.id } }); report.pending_deleted++; } catch {} }

  const activeBios = biometrics.filter((b) => b.status === 'active' && b.face_descriptor?.length && (!b.person_id || personIds.has(b.person_id)));
  const activeByPerson = {};
  for (const b of activeBios) { if (!b.person_id) continue; (activeByPerson[b.person_id] ||= []).push(b); }
  const toDeleteMulti = [];
  for (const bios of Object.values(activeByPerson)) { bios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); for (let i = 1; i < bios.length; i++) toDeleteMulti.push(bios[i]); }
  for (const b of toDeleteMulti) { try { await prisma.biometric.delete({ where: { id: b.id } }); report.multi_active_per_person_deleted++; } catch {} }

  const remaining = activeBios.filter((b) => !toDeleteMulti.includes(b));
  const revokedIds = new Set();
  for (let i = 0; i < remaining.length; i++) {
    if (revokedIds.has(remaining[i].id)) continue;
    for (let j = i + 1; j < remaining.length; j++) {
      if (revokedIds.has(remaining[j].id)) continue;
      if (remaining[i].person_id === remaining[j].person_id) continue;
      const dist = euclidean(remaining[i].face_descriptor, remaining[j].face_descriptor);
      if (dist < DUPLICATE_THRESHOLD) {
        const a = remaining[i], b = remaining[j];
        const older = new Date(a.created_at) < new Date(b.created_at) ? a : b;
        const newer = new Date(a.created_at) < new Date(b.created_at) ? b : a;
        revokedIds.add(older.id);
        report.details.push({ kept_person: newer.person_name, revoked_person: older.person_name, distance: Math.round(dist * 1000) / 1000 });
      }
    }
  }
  for (const id of revokedIds) { try { await prisma.biometric.delete({ where: { id } }); report.cross_person_duplicate_deleted++; } catch {} }

  const finalActive = await prisma.biometric.findMany({ where: { status: 'active' } });
  const personsWithBio = new Set(finalActive.map((b) => b.person_id));
  const accreditations = await prisma.accreditation.findMany();
  for (const a of accreditations) {
    const should = personsWithBio.has(a.person_id);
    if (a.has_biometric !== should) await prisma.accreditation.update({ where: { id: a.id }, data: { has_biometric: should } }).catch(() => {});
  }
  report.has_biometric_updated = accreditations.filter((a) => a.has_biometric !== personsWithBio.has(a.person_id)).length;
  return { success: true, ...report, total_deleted: report.orphaned_deleted + report.no_descriptor_deleted + report.revoked_deleted + report.pending_deleted + report.multi_active_per_person_deleted + report.cross_person_duplicate_deleted };
}