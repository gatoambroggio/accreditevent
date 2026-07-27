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

    const existing = await base44.asServiceRole.entities.Biometric.filter({ person_id, status: 'active' });
    for (const b of existing) {
      await base44.asServiceRole.entities.Biometric.update(b.id, { status: 'revoked' });
    }

    // Create using user context so created_by_id = user (enables provider RLS read)
    const biometric = await base44.entities.Biometric.create({
      person_id,
      person_name,
      event_id,
      face_photo_url,
      face_descriptor: face_descriptor || [],
      status: 'active',
    });

    return Response.json({ biometric_id: biometric.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}