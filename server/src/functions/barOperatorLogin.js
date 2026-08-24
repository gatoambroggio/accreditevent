// Login de operadores de barra (sin usuarios de plataforma). Valida username +
// password contra la entidad BarOperator y devuelve un contexto de sesión que la
// tablet guarda para usar el POS. Se expone públicamente en /api/bar-fn porque la
// tablet no tiene token de plataforma.

import { verifyPassword } from '../shared/barPassword.js';

export async function barOperatorLogin(body, { prisma }) {
  const username = (body.username || '').toString().trim().toLowerCase();
  const password = (body.password || '').toString();
  if (!username || !password) {
    return { error: 'Usuario y contraseña obligatorios', status: 400 };
  }
  const op = await prisma.barOperator.findUnique({ where: { username } }).catch(() => null);
  if (!op) return { error: 'Usuario o contraseña incorrectos', status: 401 };
  if (op.blocked) return { error: 'Operador bloqueado. Contactá al administrador.', status: 403 };

  const ok = verifyPassword(password, op.password_hash);
  if (!ok) return { error: 'Usuario o contraseña incorrectos', status: 401 };

  let sectors = [];
  let barName = op.bar_name || '';
  const bar = await prisma.bar.findUnique({ where: { id: op.bar_id } }).catch(() => null);
  if (bar) {
    barName = bar.name || barName;
    sectors = Array.isArray(bar.sectors) ? bar.sectors : [];
  }

  return {
    ok: true,
    session: {
      operator_id: op.id,
      username: op.username,
      full_name: op.full_name || op.username,
      bar_id: op.bar_id,
      bar_name: barName,
      event_id: op.event_id || '',
      event_name: op.event_name || '',
      company: op.company || '',
      sectors,
    },
  };
}