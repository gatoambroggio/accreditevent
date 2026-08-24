// Login de operadores de barra con credenciales propias (sin usuarios de plataforma).
// Recibe username + password, valida contra la entidad BarOperator (service role),
// y devuelve un contexto de sesión que la tablet guarda para usar el POS.
// No requiere sesión de plataforma.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyPassword } from '../../shared/barPassword.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const username = (body.username || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();
    if (!username || !password) {
      return Response.json({ error: 'Usuario y contraseña obligatorios' }, { status: 400 });
    }

    const found = await base44.asServiceRole.entities.BarOperator.filter({ username });
    if (!found || !found.length) {
      return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }
    const op = found[0];
    if (op.blocked) {
      return Response.json({ error: 'Operador bloqueado. Contactá al administrador.' }, { status: 403 });
    }

    const ok = await verifyPassword(password, op.password_hash);
    if (!ok) {
      return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }

    // Resolver la barra para devolver los sectores actuales del POS.
    let sectors: any[] = [];
    let barName = op.bar_name || '';
    try {
      const bars = await base44.asServiceRole.entities.Bar.filter({ id: op.bar_id });
      if (bars && bars.length) {
        barName = bars[0].name || barName;
        sectors = bars[0].sectors || [];
      }
    } catch {}

    return Response.json({
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
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Error de login' }, { status: 500 });
  }
}