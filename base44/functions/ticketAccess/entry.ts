// Validación de entradas en puerta (Base44). Requiere operador autenticado
// (la estación de control invoca con el token del operador). Marca la
// entrada como 'used' si está pagada y corresponde al evento.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, message: 'No autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body.action !== 'validate') return Response.json({ ok: false, message: 'Acción inválida' }, { status: 400 });

    const { qr_code, event_id } = body;
    if (!qr_code || !event_id) return Response.json({ ok: false, message: 'Faltan datos' }, { status: 400 });

    const tickets = await base44.asServiceRole.entities.Ticket.filter({ qr_code });
    const t = tickets && tickets[0];
    if (!t) return Response.json({ ok: false, message: 'Entrada no encontrada' });
    if (t.event_id !== event_id) return Response.json({ ok: false, message: 'La entrada no corresponde a este evento' });
    if (t.status === 'used') return Response.json({ ok: false, message: 'La entrada ya fue utilizada' });
    if (t.status !== 'paid') return Response.json({ ok: false, message: `Estado: ${t.status}` });

    await base44.asServiceRole.entities.Ticket.update(t.id, {
      status: 'used',
      used_at: new Date().toISOString(),
      verified_by: user.email || user.id,
    });
    return Response.json({
      ok: true,
      ticket: { buyer_name: t.buyer_name, ticket_type_name: t.ticket_type_name, quantity: t.quantity },
    });
  } catch (error) {
    return Response.json({ ok: false, message: error.message || 'Error interno' }, { status: 500 });
  }
}