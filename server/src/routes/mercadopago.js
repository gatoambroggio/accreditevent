// Webhook de Mercado Pago (notificaciones de pago).
// Público (MP no envía auth del usuario). Idempotente: procesa por payment_id y
// no duplica ni corrompe entradas ante reintentos.
import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { broadcast } from '../realtime/ws.js';
import { getPayment, invalidateMpCache } from '../functions/mercadopago.js';

export const mercadoPagoRouter = Router();

mercadoPagoRouter.get('/', (req, res) => {
  // Verificación de webhook al configurar la URL en Mercado Pago.
  if (req.query['challenge']) return res.json({ challenge: String(req.query['challenge']) });
  res.json({ ok: true });
});

mercadoPagoRouter.post('/', async (req, res, next) => {
  try {
    invalidateMpCache();
    // MP puede enviar por query (?type=payment&data.id=123) o en body.
    const type = req.query.type || req.body?.type;
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.body?.id;
    if (type !== 'payment' || !paymentId) return res.status(200).json({ ok: true, ignored: true });

    const payment = await getPayment(paymentId);
    const ticketId = payment.external_reference;
    if (!ticketId) return res.status(200).json({ ok: true, ignored: true });

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(200).json({ ok: true, ignored: true });

    const status = String(payment.status || '').toLowerCase();
    let nextStatus = ticket.status;
    if (status === 'approved') nextStatus = ticket.status === 'used' ? 'used' : 'paid';
    else if (status === 'rejected' || status === 'cancelled') nextStatus = 'cancelled';
    else if (status === 'refunded') nextStatus = 'refunded';
    // pending / in_process → dejamos como pending

    // Idempotencia: si ya está en el estado destino con el mismo payment_id, no reprocesamos.
    if (ticket.status === nextStatus && (ticket.payment_id === String(paymentId) || !paymentId)) {
      return res.status(200).json({ ok: true, idempotent: true });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        payment_id: ticket.payment_id || String(paymentId || ''),
      },
    });
    broadcast('Ticket', { id: ticket.id, type: 'update', data: updated });

    // Si el pago liberó stock por un approval tardío pero la entrada estaba cancelled,
    // re-reservamos el stock para mantener consistencia.
    if (nextStatus === 'paid' && (ticket.status === 'cancelled')) {
      await prisma.$executeRaw`UPDATE ticket_types SET sold = sold + ${ticket.quantity} WHERE id = ${ticket.ticket_type_id} AND sold + ${ticket.quantity} <= capacity`;
    }
    // Si se canceló/rechazó una entrada que había reservado stock, lo liberamos.
    if ((nextStatus === 'cancelled' || nextStatus === 'refunded') && (ticket.status === 'pending' || ticket.status === 'paid')) {
      await prisma.$executeRaw`UPDATE ticket_types SET sold = GREATEST(sold - ${ticket.quantity}, 0) WHERE id = ${ticket.ticket_type_id}`;
    }

    // Confirmación al comprador por WhatsApp (best-effort) al aprobarse el pago.
    if (nextStatus === 'paid') {
      try {
        const event = await prisma.event.findUnique({ where: { id: ticket.event_id } });
        if (event) await import('../functions/mercadopago.js').then((m) => m.notifyBuyerWhatsapp(updated, event));
      } catch {}
    }

    res.status(200).json({ ok: true, status: nextStatus });
  } catch (e) {
    // MP reintentará si respondemos 5xx; devolvemos 500 para que reintente.
    console.error('[mercadopago webhook]', e);
    res.status(500).json({ error: e.message });
  }
});