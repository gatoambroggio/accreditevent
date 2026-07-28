import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let loadingPromise = null;

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();
  return loadingPromise;
}

export async function getFaceDescriptor(input) {
  await loadModels();
  const detection = await faceapi
    .detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection ? Array.from(detection.descriptor) : null;
}

export function compareDescriptors(d1, d2) {
  if (!d1 || !d2 || d1.length !== d2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export const MATCH_THRESHOLD = 0.7;

export function findBestMatch(capturedDescriptor, storedEntries) {
  const scored = [];
  for (const entry of storedEntries) {
    if (!entry.face_descriptor || entry.face_descriptor.length === 0) continue;
    const distance = compareDescriptors(capturedDescriptor, entry.face_descriptor);
    scored.push({ entry, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);

  const best = scored[0];
  if (!best) {
    return { match: null, distance: Infinity, bestEntry: null, topEntries: [] };
  }
  if (best.distance < MATCH_THRESHOLD) {
    return { match: best.entry, distance: best.distance, bestEntry: best.entry, topEntries: scored };
  }
  return { match: null, distance: best.distance, bestEntry: best.entry, topEntries: scored };
}