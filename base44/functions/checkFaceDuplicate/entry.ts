import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DUPLICATE_THRESHOLD = 0.5;
const PAGE_SIZE = 500;

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
    const { face_descriptor, person_id } = body;

    if (!face_descriptor || !Array.isArray(face_descriptor) || face_descriptor.length === 0) {
      return Response.json({ error: 'face_descriptor es obligatorio' }, { status: 400 });
    }

    // Scope duplicate check by productora (tenant isolation):
    // productora users only check within their own company's biometrics; admins check globally.
    const userCompany = user?.data?.company || user?.company || '';
    const role = user?.data?.role || user?.role || '';
    const isScoped = role === 'productora' && userCompany;
    const bioFilter = isScoped ? { status: 'active', company: userCompany } : { status: 'active' };

    // Paginated fetch of active biometrics (scoped by productora when applicable)
    let allBios = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Biometric.filter(
        bioFilter,
        '-created_date',
        PAGE_SIZE,
        skip
      );
      allBios = allBios.concat(batch);
      if (batch.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
      if (skip > 10000) break; // safety limit
    }

    const duplicates = [];
    for (const b of allBios) {
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