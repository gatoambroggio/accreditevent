// Utilidades WebAuthn para el backend Node (usa Buffer en lugar de btoa/atob).

export function getRpInfo(req, fallbackOrigin) {
  const origin = req.headers.origin || req.headers.referer || fallbackOrigin;
  if (!origin) throw new Error('No se pudo determinar el origen desde los headers de la solicitud.');
  const url = new URL(origin);
  return { origin: `${url.protocol}//${url.host}`, rpId: url.hostname };
}

export function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}