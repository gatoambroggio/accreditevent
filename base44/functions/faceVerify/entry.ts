import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { accreditation_id, captured_photo_url } = body;

    if (!accreditation_id || !captured_photo_url) {
      return Response.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const accreditation = await base44.asServiceRole.entities.Accreditation.get(accreditation_id);
    if (!accreditation) {
      return Response.json({ error: 'Acreditación no encontrada' }, { status: 404 });
    }
    if (accreditation.status !== 'active') {
      return Response.json({ error: `Acreditación ${accreditation.status}` }, { status: 403 });
    }

    const bios = await base44.asServiceRole.entities.Biometric.filter(
      { person_id: accreditation.person_id, status: 'active' },
      '-created_date',
      1
    );

    if (bios.length === 0 || !bios[0].face_photo_url) {
      return Response.json({ error: 'Sin rostro registrado' }, { status: 400 });
    }

    const storedPhoto = bios[0].face_photo_url;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt:
        'Sos un sistema de verificación de identidad. Compará las dos imágenes: la PRIMERA es la foto de registro de la persona, la SEGUNDA es una captura en vivo tomada con cámara web. ¿Son la misma persona? Analiná features faciales (forma de rostro, ojos, nariz, boca, cejas). Respondé únicamente con el JSON.',
      file_urls: [storedPhoto, captured_photo_url],
      response_json_schema: {
        type: 'object',
        properties: {
          match: { type: 'boolean', description: 'true si son la misma persona' },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['match', 'confidence'],
      },
    });

    const verified = result.match === true;

    if (verified) {
      await base44.asServiceRole.entities.AccessLog.create({
        accreditation_id: accreditation.id,
        person_name: accreditation.person_name,
        badge_code: accreditation.badge_code,
        event_name: accreditation.event_name,
        verified_by: user.full_name || user.email,
        method: 'biometric',
      });

      await base44.asServiceRole.entities.AuditLog.create({
        actor_name: user.full_name || user.email,
        actor_id: user.id,
        action: 'face-verify-success',
        entity: 'Accreditation',
        entity_id: accreditation.id,
        detail: accreditation.person_name,
      });
    }

    return Response.json({
      verified,
      confidence: result.confidence,
      person_name: accreditation.person_name,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}