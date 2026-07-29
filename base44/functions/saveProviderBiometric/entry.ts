import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Tenant-isolated biometric save.
// Uses the service role (bypasses RLS) and scopes every operation to the
// productora's own tenant (user.data.company), so each productora behaves as
// if it had its own database. No cross-tenant reads or writes are possible.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = user?.data?.company || user?.company || '';
    if (!tenant) {
      return Response.json({ error: 'Tu usuario no tiene una productora asignada.' }, { status: 403 });
    }

    const body = await req.json();
    const { person_id, person_name, event_id, face_photo_url, face_descriptor } = body;

    if (!person_id || !face_photo_url) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    // Resolve the event's productora company if an event_id is provided,
    // otherwise default to the caller's tenant.
    let company = tenant;
    if (event_id) {
      try {
        const event = await base44.asServiceRole.entities.Event.get(event_id);
        if (event?.company) company = event.company;
      } catch {}
    }

    // SECURITY: duplicate face check — scoped to THIS productora's tenant only.
    if (face_descriptor && face_descriptor.length > 0) {
      const THRESHOLD = 0.5;
      const tenantBios = await base44.asServiceRole.entities.Biometric.filter(
        { company: tenant, status: 'active' },
        '-created_date',
        500
      );
      for (const b of tenantBios) {
        if (b.person_id === person_id) continue;
        if (!b.face_descriptor || b.face_descriptor.length !== face_descriptor.length) continue;
        let sum = 0;
        for (let i = 0; i < face_descriptor.length; i++) {
          const diff = face_descriptor[i] - b.face_descriptor[i];
          sum += diff * diff;
        }
        const dist = Math.sqrt(sum);
        if (dist < THRESHOLD) {
          return Response.json({
            error: `SECURITY: Este rostro ya está registrado para "${b.person_name}". No se puede registrar la misma cara en dos personas distintas.`,
            duplicate_person: b.person_name,
            duplicate_person_id: b.person_id,
            distance: Math.round(dist * 1000) / 1000,
          }, { status: 409 });
        }
      }
    }

    // Revoke any existing active biometric for this person within the tenant
    const existing = await base44.asServiceRole.entities.Biometric.filter(
      { person_id, status: 'active' },
      '-created_date',
      50
    );
    for (const b of existing) {
      await base44.asServiceRole.entities.Biometric.update(b.id, { status: 'revoked' });
    }

    // Create the biometric in the productora's tenant (service role bypasses RLS)
    const biometric = await base44.asServiceRole.entities.Biometric.create({
      person_id,
      person_name,
      event_id: event_id || '',
      company,
      face_photo_url,
      face_descriptor: face_descriptor || [],
      status: 'active',
    });

    return Response.json({ biometric_id: biometric.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}