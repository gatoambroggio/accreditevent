import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DUPLICATE_THRESHOLD = 0.5;

function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Authorize: admin user OR service-role (from workflow)
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user && ['superadmin', 'admin'].includes(user.role)) {
        isAuthorized = true;
      }
    } catch {
      isAuthorized = true; // service-role call from workflow
    }
    if (!isAuthorized) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const report = {
      orphaned_deleted: 0,
      no_descriptor_deleted: 0,
      revoked_deleted: 0,
      pending_deleted: 0,
      multi_active_per_person_deleted: 0,
      cross_person_duplicate_deleted: 0,
      has_biometric_updated: 0,
      details: [],
    };

    const [biometrics, persons] = await Promise.all([
      base44.asServiceRole.entities.Biometric.list('-created_date', 500),
      base44.asServiceRole.entities.Person.list('-created_date', 500),
    ]);
    const personIds = new Set(persons.map((p) => p.id));

    // 1. Delete orphaned biometrics (person doesn't exist)
    const orphaned = biometrics.filter((b) => b.person_id && !personIds.has(b.person_id));
    for (const b of orphaned) {
      try { await base44.asServiceRole.entities.Biometric.delete(b.id); report.orphaned_deleted++; } catch {}
    }

    // 2. Delete biometrics without face_descriptor
    const noDescriptor = biometrics.filter((b) => !b.face_descriptor || b.face_descriptor.length === 0);
    for (const b of noDescriptor) {
      try { await base44.asServiceRole.entities.Biometric.delete(b.id); report.no_descriptor_deleted++; } catch {}
    }

    // 3. Delete revoked biometrics
    const revoked = biometrics.filter((b) => b.status === 'revoked');
    for (const b of revoked) {
      try { await base44.asServiceRole.entities.Biometric.delete(b.id); report.revoked_deleted++; } catch {}
    }

    // 4. Delete pending biometrics
    const pending = biometrics.filter((b) => b.status === 'pending');
    for (const b of pending) {
      try { await base44.asServiceRole.entities.Biometric.delete(b.id); report.pending_deleted++; } catch {}
    }

    // 5. Active biometrics with valid descriptors and valid persons
    const activeBios = biometrics.filter(
      (b) =>
        b.status === 'active' &&
        b.face_descriptor &&
        b.face_descriptor.length > 0 &&
        (!b.person_id || personIds.has(b.person_id))
    );

    // 5a. One active biometric per person (keep most recent)
    const activeByPerson = {};
    for (const b of activeBios) {
      if (!b.person_id) continue;
      if (!activeByPerson[b.person_id]) activeByPerson[b.person_id] = [];
      activeByPerson[b.person_id].push(b);
    }
    const toDeleteMulti = [];
    for (const [pid, bios] of Object.entries(activeByPerson)) {
      bios.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      for (let i = 1; i < bios.length; i++) toDeleteMulti.push(bios[i]);
    }
    for (const b of toDeleteMulti) {
      try { await base44.asServiceRole.entities.Biometric.delete(b.id); report.multi_active_per_person_deleted++; } catch {}
    }

    // 5b. Cross-person face duplicates (same face on different persons)
    const remainingActive = activeBios.filter((b) => !toDeleteMulti.includes(b));
    const revokedIds = new Set();
    for (let i = 0; i < remainingActive.length; i++) {
      if (revokedIds.has(remainingActive[i].id)) continue;
      for (let j = i + 1; j < remainingActive.length; j++) {
        if (revokedIds.has(remainingActive[j].id)) continue;
        const a = remainingActive[i];
        const b = remainingActive[j];
        if (a.person_id === b.person_id) continue;
        const dist = euclideanDistance(a.face_descriptor, b.face_descriptor);
        if (dist < DUPLICATE_THRESHOLD) {
          const aDate = new Date(a.created_date);
          const bDate = new Date(b.created_date);
          const older = aDate < bDate ? a : b;
          const newer = aDate < bDate ? b : a;
          revokedIds.add(older.id);
          report.details.push({
            kept_person: newer.person_name,
            revoked_person: older.person_name,
            distance: Math.round(dist * 1000) / 1000,
          });
        }
      }
    }
    for (const id of revokedIds) {
      try { await base44.asServiceRole.entities.Biometric.delete(id); report.cross_person_duplicate_deleted++; } catch {}
    }

    // 6. Sync Accreditation has_biometric flags
    const finalActive = await base44.asServiceRole.entities.Biometric.filter({ status: 'active' }, '-created_date', 500);
    const personsWithBio = new Set(finalActive.map((b) => b.person_id));
    const accreditations = await base44.asServiceRole.entities.Accreditation.list('-created_date', 500);
    const accUpdates = [];
    for (const a of accreditations) {
      const should = personsWithBio.has(a.person_id);
      if (a.has_biometric !== should) accUpdates.push({ id: a.id, has_biometric: should });
    }
    if (accUpdates.length > 0) {
      await base44.asServiceRole.entities.Accreditation.bulkUpdate(accUpdates);
      report.has_biometric_updated = accUpdates.length;
    }

    return Response.json({
      success: true,
      ...report,
      total_deleted:
        report.orphaned_deleted +
        report.no_descriptor_deleted +
        report.revoked_deleted +
        report.pending_deleted +
        report.multi_active_per_person_deleted +
        report.cross_person_duplicate_deleted,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}