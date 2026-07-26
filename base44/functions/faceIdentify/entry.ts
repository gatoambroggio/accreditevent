import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const BATCH_SIZE = 8;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { captured_photo_url } = body;

    if (!captured_photo_url) {
      return Response.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Get all active biometrics with face photos
    const bios = await base44.asServiceRole.entities.Biometric.filter(
      { status: 'active' },
      '-created_date',
      500
    );

    const withPhotos = bios.filter((b) => b.face_photo_url);
    if (withPhotos.length === 0) {
      return Response.json({
        verified: false,
        message: 'No hay rostros registrados en el sistema.',
      });
    }

    // Get all active accreditations (for access check)
    const accreditations = await base44.asServiceRole.entities.Accreditation.filter(
      { status: 'active' },
      '-created_date',
      500
    );

    // Batch identification: send captured photo + up to BATCH_SIZE stored photos
    let matchedBiometric = null;

    for (let i = 0; i < withPhotos.length; i += BATCH_SIZE) {
      const batch = withPhotos.slice(i, i + BATCH_SIZE);
      const fileUrls = [captured_photo_url, ...batch.map((b) => b.face_photo_url)];

      const prompt =
        `Sos un sistema de identificación facial. Vas a recibir ${batch.length + 1} imágenes. ` +
        `La PRIMERA imagen (índice 1) es una captura en vivo de una cámara. ` +
        `Las imágenes 2 a ${batch.length + 1} son fotos de registro de diferentes personas. ` +
        `Compará la captura en vivo con cada foto de registro. ` +
        `¿Qué foto de registro muestra la misma persona que la captura en vivo? ` +
        `Analizá forma de rostro, ojos, nariz, boca, cejas y estructura facial. ` +
        `Devolvé el índice (basado en 1) de la imagen que coincide (2 = primera foto de registro, 3 = segunda, etc.). ` +
        `Si ninguna coincide, devolvé 0.`;

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        file_urls: fileUrls,
        response_json_schema: {
          type: 'object',
          properties: {
            match_index: {
              type: 'number',
              description: 'Índice basado en 1 de la imagen que coincide, o 0 si no hay coincidencia',
            },
          },
          required: ['match_index'],
        },
      });

      if (result.match_index >= 2) {
        matchedBiometric = batch[result.match_index - 2];
        if (matchedBiometric) break;
      }
    }

    if (!matchedBiometric) {
      return Response.json({
        verified: false,
        message: 'No se encontró coincidencia facial.',
      });
    }

    // Find the active accreditation for this person
    const accred = accreditations.find((a) => a.person_id === matchedBiometric.person_id);
    if (!accred) {
      return Response.json({
        verified: false,
        message: 'Persona identificada pero sin acreditación activa.',
        person_name: matchedBiometric.person_name,
      });
    }

    // Log the access
    await base44.asServiceRole.entities.AccessLog.create({
      accreditation_id: accred.id,
      person_name: accred.person_name,
      badge_code: accred.badge_code,
      event_name: accred.event_name,
      verified_by: user.full_name || user.email,
      method: 'biometric',
    });

    await base44.asServiceRole.entities.AuditLog.create({
      actor_name: user.full_name || user.email,
      actor_id: user.id,
      action: 'face-identify-success',
      entity: 'Accreditation',
      entity_id: accred.id,
      detail: accred.person_name,
    });

    return Response.json({
      verified: true,
      person_name: accred.person_name,
      accred,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}