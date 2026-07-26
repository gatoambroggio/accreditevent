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
      model: 'claude_sonnet_4_6',
      prompt:
        'Sos un sistema de verificación biométrica de identidad.\n' +
        'IMAGEN 1: foto de registro de la persona (referencia).\n' +
        'IMAGEN 2: captura en vivo tomada con cámara web.\n\n' +
        'INSTRUCCIONES:\n' +
        '1. Verificá que la IMAGEN 2 contenga un ROSTRO HUMANO claramente visible y frontal. ' +
        'Si NO hay un rostro humano (es un objeto, animal, mano, pared, pantalla, o cualquier cosa que no sea una cara humana), ' +
        'devolvé match: false y confidence: 0.\n' +
        '2. Si hay un rostro humano, compará cuidadosamente con la IMAGEN 1 analizando:\n' +
        '   - Forma y proporciones del rostro (ovalado, redondo, cuadrado)\n' +
        '   - Distancia entre ojos y posición relativa\n' +
        '   - Forma y tamaño de la nariz\n' +
        '   - Forma de la boca y grosor de labios\n' +
        '   - Cejas: forma, grosor, curvatura y posición\n' +
        '   - Línea mandibular y mentón\n' +
        '   - Color y estilo de cabello (si visible)\n' +
        '3. Solo devolvé match: true si estás MUY seguro de que es la misma persona. ' +
        'Ante la MÍNIMA duda, devolvé match: false. La seguridad es prioridad.\n' +
        'Respondé únicamente con el JSON.',
      file_urls: [storedPhoto, captured_photo_url],
      response_json_schema: {
        type: 'object',
        properties: {
          match: { type: 'boolean', description: 'true SOLO si es la misma persona con alta confianza' },
          confidence: { type: 'number', description: 'Nivel de confianza de 0 a 1' },
          reason: { type: 'string', description: 'Breve explicación de la decisión' },
        },
        required: ['match', 'confidence'],
      },
    });

    const verified = result.match === true && typeof result.confidence === 'number' && result.confidence >= 0.85;

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