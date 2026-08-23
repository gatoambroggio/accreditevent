// Webhook de Mercado Pago (Base44). Endpoint público anónimo: MP lo llama
// para notificar cambios de estado de pago. Idempotente por payment_id.
// Configurá la URL en Mercado Pago como:
//   https://<tu-app>.base44.app/functions/mercadopagoWebhook

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Verificación de salud que envía MP al configurar el webhook.
    if (body.type === 'healthcheck' || body.action === 'webhook.healthcheck' || body.action === 'mp.healthcheck') {
      return Response.json({ status: 200, message: 'ok' });
    }
    // Solo nos interesan los eventos de pago.
    if (body.type !== 'payment') return Response.json({ ok: true });

    const paymentId = body.data?.id;
    if (!paymentId) return Response.json({ ok: true });

    const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
    const mp = settings[0]?.mercadopago || {};
    if (!mp.access_token) return Response.json({ error: 'Mercado Pago no configurado' }, { status: 500 });

    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mp.access_token}` },
    });
    if (!payRes.ok) return Response.json({ error: 'No se pudo obtener el pago de MP' }, { status: 502 });
    const pay = await payRes.json();

    const ticketId = pay.external_reference;
    if (!ticketId) return Response.json({ ok: true });

    const ticket = await base44.asServiceRole.entities.Ticket.get(ticketId);
    if (!ticket) return Response.json({ ok: true });

    const st = pay.status; // approved | rejected | cancelled | pending | in_process
    let newStatus = ticket.status;
    if (st === 'approved') newStatus = 'paid';
    else if (st === 'rejected' || st === 'cancelled') newStatus = 'cancelled';
    else if (st === 'pending' || st === 'in_process') newStatus = 'pending';

    if (newStatus !== ticket.status) {
      await base44.asServiceRole.entities.Ticket.update(ticketId, { status: newStatus, payment_id: String(paymentId) });
      // Si se cancela/rechaza, liberar el stock reservado.
      if (newStatus === 'cancelled' && ticket.status !== 'cancelled') {
        const type = await base44.asServiceRole.entities.TicketType.get(ticket.ticket_type_id);
        if (type) {
          await base44.asServiceRole.entities.TicketType.update(ticket.ticket_type_id, {
            sold: Math.max(0, (type.sold || 0) - (ticket.quantity || 0)),
          });
        }
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}