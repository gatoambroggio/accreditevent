import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { person_id, person_name, event_id, face_photo_url, face_descriptor } = body;

    if (!person_id || !face_photo_url) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 });
    }

    // SECURITY: Check for face duplicate on a DIFFERENT person before saving
    if (face_descriptor && face_descriptor.length > 0) {
      const THRESHOLD = 0.5;
      const existingBios = await base44.asServiceRole.entities.Biometric.filter(
        { status: 'active' },
        '-created_date',
        500
      );
      for (const b of existingBios) {
        if (b.person_id === person_id) continue; // same person, skip
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

    // Look up the event to get the productora company for RLS
    let company = '';
    if (event_id) {
      try {
        const event = await base44.asServiceRole.entities.Event.get(event_id);
        company = event?.company || '';
      } catch {}
    }

    const existing = await base44.asServiceRole.entities.Biometric.filter({ person_id, status: 'active' });
    for (const b of existing) {
      await base44.asServiceRole.entities.Biometric.update(b.id, { status: 'revoked' });
    }

    // Create using user context so created_by_id = user (enables provider RLS read)
    const biometric = await base44.entities.Biometric.create({
      person_id,
      person_name,
      event_id,
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