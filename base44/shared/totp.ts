// TOTP (RFC 6238) basado en Web Crypto. Compatible con el runtime de las
// funciones backend y con el navegador. El secreto se guarda en hex.

const STEP = 30;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function randomHex(bytes = 20): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

function counterBuffer(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let c = Math.floor(counter);
  for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  return buf;
}

export async function generateTotp(secretHex: string, counter: number): Promise<string> {
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

export function nowCounter(): number {
  return Math.floor(Date.now() / 1000 / STEP);
}

export function secondsRemaining(step = STEP): number {
  return step - (Math.floor(Date.now() / 1000) % step);
}

export async function verifyTotp(secretHex: string, code: string, window = 1): Promise<boolean> {
  const c = nowCounter();
  for (let i = -window; i <= window; i++) {
    const candidate = await generateTotp(secretHex, c + i);
    if (candidate === code) return true;
  }
  return false;
}

// Codificación del payload del QR dinámico. Formato compacto:
// AE:<ticket_id>:<codigo_6_digitos>
export function encodeDynamicQr(ticketId: string, code: string): string {
  return `AE:${ticketId}:${code}`;
}

export function decodeDynamicQr(raw: string): { ticketId: string; code: string } | null {
  const parts = String(raw || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'AE') return null;
  return { ticketId: parts[1], code: parts[2] };
}