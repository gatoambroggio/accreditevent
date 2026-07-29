import * as faceapi from '@vladmandic/face-api';
import { loadModels } from '@/lib/faceRecognition';
import { base44 } from '@/api/base44Client';

/**
 * Extracts a face from a DNI image, uploads it, and creates a Biometric record.
 * @param {File} file - The DNI image file
 * @param {object} person - The person record (must have id)
 * @param {string} company - Company name for the biometric record
 * @returns {Promise<{faceUrl: string, descriptor: number[]}>}
 */
export async function extractFaceFromDni(file, person, company) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen del DNI.'));
    };
  });

  await loadModels();

  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();

  URL.revokeObjectURL(url);

  if (!detection) {
    throw new Error('No se detectó un rostro en la imagen del DNI. Subí una foto donde el rostro sea claramente visible.');
  }

  const box = detection.detection.box;
  const padding = Math.max(box.width, box.height) * 0.4;
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const w = Math.min(img.naturalWidth - x, box.width + padding * 2);
  const h = Math.min(img.naturalHeight - y, box.height + padding * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

  const faceBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  const faceFile = new File([faceBlob], `dni-face-${person.id}.jpg`, { type: 'image/jpeg' });

  const { file_url: faceUrl } = await base44.integrations.Core.UploadFile({ file: faceFile });
  const descriptor = Array.from(detection.descriptor);

  // SECURITY: Check face duplicate on a different person before saving
  const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
    face_descriptor: descriptor,
    person_id: person.id,
  });
  if (dupCheck.is_duplicate) {
    throw new Error(`Este rostro ya está registrado para "${dupCheck.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
  }

  const existing = await base44.entities.Biometric.filter({ person_id: person.id, status: 'active' });
  for (const b of existing) {
    await base44.entities.Biometric.update(b.id, { status: 'revoked' });
  }

  await base44.entities.Biometric.create({
    person_id: person.id,
    person_name: person.full_name || '',
    company: company || person.company || person.productora || '',
    face_photo_url: faceUrl,
    face_descriptor: descriptor,
    status: 'active',
  });

  try {
    const accrs = await base44.entities.Accreditation.filter({ person_id: person.id });
    if (accrs.length > 0) {
      await base44.entities.Accreditation.bulkUpdate(accrs.map((a) => ({ id: a.id, has_biometric: true })));
    }
  } catch {}

  return { faceUrl, descriptor: Array.from(detection.descriptor) };
}