/**
 * Shared WebAuthn utilities for backend functions.
 */

export function getRpInfo(req, fallbackOrigin) {
  const origin = req.headers.get('origin') || req.headers.get('referer') || fallbackOrigin;
  if (!origin) {
    throw new Error('No se pudo determinar el origen desde los headers de la solicitud.');
  }
  const url = new URL(origin);
  return {
    origin: `${url.protocol}//${url.host}`,
    rpId: url.hostname,
  };
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}