import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { nanoid } from 'nanoid';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );
}

export function signRefreshToken(user) {
  const token = jwt.sign({ sub: user.id, jti: nanoid() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
  return token;
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret);
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.jwt.refreshSecret);
  } catch {
    return null;
  }
}