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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { face_descriptor, person_id, event_id } = body;

    if (!face_descriptor || !Array.isArray(face_descriptor) || face_descriptor.length === 0) {
      return Response.json({ error: 'face_descriptor es obligatorio' }, { status: 400 });
    }

    // Get ALL active biometrics globally — duplicates must be caught across ALL events
    const bios = await base44.asServiceRole.entities.Biometric.filter(
      { status: 'active' },
      '-created_date',
      500
    );

    const duplicates = [];
    for (const b of bios) {
      // Skip same person (they can re-register their own face)
      if (person_id && b.person_id === person_id) continue;
      if (!b.face_descriptor || b.face_descriptor.length === 0) continue;

      const dist = euclideanDistance(face_descriptor, b.face_descriptor);
      if (dist < DUPLICATE_THRESHOLD) {
        duplicates.push({
          biometric_id: b.id,
          person_id: b.person_id,
          person_name: b.person_name,
          event_id: b.event_id,
          distance: Math.round(dist * 1000) / 1000,
        });
      }
    }

    return Response.json({
      is_duplicate: duplicates.length > 0,
      duplicates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}