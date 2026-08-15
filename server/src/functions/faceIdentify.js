// Identificación facial del lado servidor (opcional). El reconocimiento
// principal corre en el navegador con face-api.js; esta función permite
// validar el mejor candidato contra los descriptores guardados cuando se
// necesita desde el backend. Recibe un descriptor candidato y busca el más
// cercano por distancia euclidiana.

import { prisma } from '../db/prisma.js';

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export async function faceIdentify({ descriptor, event_id, threshold = 0.5 }, { prisma: p = prisma } = {}) {
  if (!Array.isArray(descriptor)) return { error: 'descriptor requerido (array de 128)' };
  const where = { status: 'active' };
  if (event_id) where.event_id = event_id;
  const bios = await p.biometric.findMany({ where, select: { id: true, person_id: true, person_name: true, face_descriptor: true, event_id: true } });
  let best = null;
  for (const b of bios) {
    if (!b.face_descriptor || b.face_descriptor.length !== descriptor.length) continue;
    const d = euclidean(descriptor, b.face_descriptor);
    if (!best || d < best.distance) best = { ...b, distance: d };
  }
  if (!best) return { matched: false, message: 'Sin biometría registrada para comparar.' };
  if (best.distance > threshold) return { matched: false, distance: best.distance, message: 'Sin coincidencia suficiente.' };
  return { matched: true, person_id: best.person_id, person_name: best.person_name, distance: best.distance, biometric_id: best.id };
}