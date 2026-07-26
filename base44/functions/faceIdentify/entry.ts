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
        `Sos un sistema de identificación biométrica facial. Vas a recibir ${batch.length + 1} imágenes.\n` +
        `IMAGEN 1 (índice 1): captura en vivo de una cámara.\n` +
        `IMÁGENES 2 a ${batch.length + 1}: fotos de registro de diferentes personas.\n\n` +
        `INSTRUCCIONES:\n` +
        `1. Verificá PRIMERO que la IMAGEN 1 contenga un ROSTRO HUMANO claramente visible y frontal. ` +
        `Si NO hay un rostro humano (es un objeto, animal, mano, pared, pantalla, o cualquier cosa que no sea una cara humana), ` +
        `devolvé match_index: 0 y confidence: 0.\n` +
        `2. Si hay un rostro humano, compará con CADA foto de registro analizando:\n` +
        `   - Forma y proporciones del rostro (ovalado, redondo, cuadrado)\n` +
        `   - Distancia entre ojos y posición relativa\n` +
        `   - Forma y tamaño de la nariz\n` +
        `   - Forma de la boca y grosor de labios\n` +
        `   - Cejas: forma, grosor, curvatura y posición\n` +
        `   - Línea mandibular y mentón\n` +
        `   - Color y estilo de cabello (si visible)\n` +
        `3. Solo devolvé un match_index distinto de 0 si estás MUY seguro de que es la misma persona. ` +
        `Ante la MÍNIMA duda, devolvé match_index: 0. La seguridad es prioridad.\n` +
        `Respondé únicamente con el JSON.`;

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt,
        file_urls: fileUrls,
        response_json_schema: {
          type: 'object',
          properties: {
            match_index: {
              type: 'number',
              description: 'Índice basado en 1 de la imagen que coincide, o 0 si no hay coincidencia o no hay rostro humano',
            },
            confidence: { type: 'number', description: 'Nivel de confianza de 0 a 1' },
          },
          required: ['match_index', 'confidence'],
        },
      });

      if (result.match_index >= 2 && typeof result.confidence === 'number' && result.confidence >= 0.85) {
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