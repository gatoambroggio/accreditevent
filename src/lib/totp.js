// TOTP (RFC 6238) para el navegador. Genera el código que rota cada 30s a
// partir del secreto de la entrada. Compatible con base44/shared/totp.ts.

const STEP = 30;

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function counterBuffer(counter) {
  const buf = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  return buf;
}

export async function generateTotp(secretHex, counter) {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHex),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuffer(counter)));
  const offset = sig[sig.length - 1] & 0xf;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return (bin % 1000000).toString().padStart(6, '0');
}

export function nowCounter() {
  return Math.floor(Date.now() / 1000 / STEP);
}

export function secondsRemaining(step = STEP) {
  return step - (Math.floor(Date.now() / 1000) % step);
}

export function encodeDynamicQr(ticketId, code) {
  return `AE:${ticketId}:${code}`;
}