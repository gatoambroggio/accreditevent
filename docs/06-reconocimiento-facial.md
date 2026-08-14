# 06 — Reconocimiento facial (face-api.js)

El descriptor facial se calcula **en el navegador/PDA** con face-api.js y los modelos descargados localmente. El servidor solo almacena descriptores y hace matching euclidiano. Cero llamadas externas.

## Modelos (descargar una vez al servidor)

Descargar de https://github.com/justadudewhohacks/face-api.js-models y servirlos como estáticos:
- `tiny_face_detector_model-weights_manifest.json` + `.bin`
- `face_landmark_68_model-...`
- `face_recognition_model-...`

Ponerlos en `/public/models/` del frontend y en `uploads/models/` del servidor. En air-gap, servirlos por Nginx.

## Frontend — captura de descriptor

```jsx
// hooks/useFaceApi.js
import * as faceapi from '@vladmandic/face-api'; // o face-api.js
import { useEffect, useState } from 'react';

export function useFaceApi() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]).then(() => setReady(true));
  }, []);
  return { ready, faceapi };
}

export async function captureDescriptor(videoEl) {
  const det = await faceapi
    .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) throw new Error('No se detectó rostro');
  return Array.from(det.descriptor); // Float32Array → array de 128 números
}
```

## Guardado en el servidor

```js
// POST /biometrics
router.post('/biometrics', authRequired, async (req, res) => {
  const { person_id, event_id, face_descriptor, face_photo_base64 } = req.body;
  if (!canWrite('Biometric', 'create', req.user.role)) return res.status(403).end();

  // Chequeo de duplicado ANTES de guardar (paginado, sin límite 500)
  const dup = await findFaceDuplicate(face_descriptor, event_id, person_id);
  if (dup) return res.status(409).json({ error: 'Rostro ya registrado', match: dup.person_name });

  let face_photo_url = null;
  if (face_photo_base64) face_photo_url = await saveBase64Image(face_photo_base64);

  const bio = await prisma.biometric.create({
    data: { person_id, event_id, face_descriptor, face_photo_url, status: 'active',
            company: req.user.company, person_name: req.body.person_name }
  });
  await prisma.accreditation.updateMany({ where: { person_id }, data: { has_biometric: true } });
  res.json({ data: bio });
});
```

## Chequeo de duplicado (paginado)

```js
// lib/faceMatch.js
const THRESHOLD = 0.5; // distancia euclidiana — ajustar empiricamente

async function findFaceDuplicate(descriptor, eventId, excludePersonId) {
  const target = Float32Array.from(descriptor);
  let cursor = null;
  do {
    const batch = await prisma.biometric.findMany({
      where: { event_id: eventId, status: 'active', person_id: { not: excludePersonId } },
      take: 500, skip: cursor ?? 0,
      orderBy: { created_date: 'asc' },
    });
    for (const b of batch) {
      const dist = euclidean(target, Float32Array.from(b.face_descriptor));
      if (dist < THRESHOLD) return { person_id: b.person_id, person_name: b.person_name, distance: dist };
    }
    cursor = (cursor ?? 0) + batch.length;
    if (batch.length < 500) break;
  } while (true);
  return null;
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
```

## Identificación (1:N) para acreditación facial

```js
// POST /biometrics/identify — recibe descriptor + event_id, devuelve mejor candidato
router.post('/biometrics/identify', authRequired, async (req, res) => {
  const { face_descriptor, event_id } = req.body;
  const target = Float32Array.from(face_descriptor);
  let best = null, cursor = 0;
  do {
    const batch = await prisma.biometric.findMany({
      where: { event_id, status: 'active' }, take: 500, skip: cursor,
    });
    for (const b of batch) {
      const dist = euclidean(target, Float32Array.from(b.face_descriptor));
      if (!best || dist < best.distance) best = { ...b, distance: dist };
    }
    cursor += batch.length;
    if (batch.length < 500) break;
  } while (true);
  if (best && best.distance < THRESHOLD)
    return res.json({ match: { person_id: best.person_id, person_name: best.person_name, distance: best.distance } });
  res.json({ match: null });
});
```

## Known issues a corregir en el self-hosted
- **Biometric fallback falla cuando el candidato es marginal:** subir `THRESHOLD` y exigir margen entre el 1º y 2º candidato (ratio > 1.2) antes de aceptar.
- **checkFaceDuplicate / cleanupBiometrics cap 500:** la paginación del `do/while` de arriba resuelve esto — **no cortar en 500**.
- **EmployeeFormModal no asocia event_id a biometría:** el endpoint `/biometrics` debe exigir `event_id` obligatorio y propagarlo desde el form.
- **DNI único global:** validar `document` único en `/people` POST antes de crear biometría.

## EmergencyScan (offline)
En el navegador, EmergencyScan carga los descriptores del store `people_emergency` en memoria y corre el matching euclidiano en el cliente (sin servidor). Si el caché es grande (>10k), indexar por bucket para acelerar.