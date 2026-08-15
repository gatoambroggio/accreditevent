import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// OTP de 6 dígitos para registro/reset en air-gap (se muestra en log del server).
export function genOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function genBadgePrefix(len = 4) {
  return nanoid(len).toUpperCase();
}