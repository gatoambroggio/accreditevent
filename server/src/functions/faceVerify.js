// Verificación facial air-gapped: compara descriptor capturado contra el
// descriptor guardado del rostro registrado (euclidiana). Reemplaza el
// InvokeLLM de visión de Base44 (sin internet).

function euclidean(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }

export async function faceVerify({ accreditation_id, captured_photo_url, captured_descriptor }, { user, prisma }) {
  if (!accreditation_id) throw Object.assign(new Error('Faltan parámetros'), { status: 400 });
  const accred = await prisma.accreditation.findUnique({ where: { id: accreditation_id } });
  if (!accred) throw Object.assign(new Error('Acreditación no encontrada'), { status: 404 });
  if (accred.status !== 'active') throw Object.assign(new Error(`Acreditación ${accred.status}`), { status: 403 });

  const bios = await prisma.biometric.findMany({ where: { person_id: accred.person_id, status: 'active' }, orderBy: { created_at: 'desc' }, take: 1 });
  if (bios.length === 0 || !bios[0].face_descriptor?.length) throw Object.assign(new Error('Sin rostro registrado'), { status: 400 });
  const stored = bios[0];

  // Si el cliente envía descriptor capturado (face-api.js), comparamos localmente.
  if (Array.isArray(captured_descriptor) && captured_descriptor.length === stored.face_descriptor.length) {
    const dist = euclidean(captured_descriptor, stored.face_descriptor);
    const verified = dist < 0.5;
    await logResult(prisma, accred, verified, user);
    return { verified, confidence: Math.max(0, 1 - dist), reason: dist < 0.5 ? 'Coincidencia facial' : 'Distancia facial insuficiente', distance: dist, person_name: accred.person_name };
  }
  // Sin descriptor: no podemos verificar sin LLM en air-gap.
  await logResult(prisma, accred, false, user);
  return { verified: false, confidence: 0, reason: 'Se requiere descriptor facial capturado (face-api.js) para verificación offline.', person_name: accred.person_name };
}

async function logResult(prisma, accred, verified, user) {
  await prisma.accessLog.create({ data: {
    accreditation_id: accred.id, person_name: accred.person_name, badge_code: accred.badge_code,
    event_id: accred.event_id, event_name: accred.event_name, company: accred.company,
    verified_by: user?.full_name || user?.email || '', method: 'biometric',
    result: verified ? 'granted' : 'denied', access_level: accred.access_level,
  } });
}