import { verifyAccessToken } from './jwt.js';
import { prisma } from '../db/prisma.js';

// Adjunta req.user si hay token válido (no falla si no hay).
export async function attachUser(req, _res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user && !user.blocked) {
        req.user = {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          data: user.data || {},
        };
      }
    }
  }
  next();
}

// Requiere auth: 401 si no hay user.
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: 'Token inválido o expirado' });
  (async () => {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Usuario inexistente' });
    if (user.blocked) return res.status(403).json({ error: 'Usuario bloqueado' });
    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      data: user.data || {},
    };
    next();
  })().catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Permiso insuficiente' });
    next();
  };
}