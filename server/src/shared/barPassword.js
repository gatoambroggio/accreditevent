// Hashing de contraseñas de operadores de barra (PBKDF2-SHA256) — réplica Node
// del helper cloud (base44/shared/barPassword.ts). Mismo formato almacenado:
// pbkdf2$<iteraciones>$<base64(salt)>$<base64(hash)>, para que los hashes sean
// compatibles entre el runtime cloud y el servidor self-hosted.

import crypto from 'node:crypto';

const ITER = 100000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, ITER, 32, 'sha256');
  return `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = Number(parts[1]);
    const salt = Buffer.from(parts[2], 'base64');
    const hash = Buffer.from(parts[3], 'base64');
    const test = crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, iterations, hash.length, 'sha256');
    return crypto.timingSafeEqual(test, hash);
  } catch {
    return false;
  }
}