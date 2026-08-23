// Rutas de venta de entradas (ticketera).
//   - ticketsPublicRouter: tienda pública (sin auth): listar eventos con venta
//     activa, ver tipos de entrada, crear orden (reserva atómica + preferencia
//     Mercado Pago) y consultar una entrada por id (página de confirmación).
//   - ticketsAdminRouter: dashboard admin (auth): stats y export CSV.
//   - ticketAccessRouter: validación en puerta (auth): escanea QR, marca usada.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { canAccess, getPolicy } from '../rls/engine.js';
import { broadcast } from '../realtime/ws.js';
import { createPreference, getMpConfig, notifyBuyerWhatsapp } from '../functions/mercadopago.js';

export const ticketsPublicRouter = Router();
export const ticketsAdminRouter = Router();
export const ticketAccessRouter = Router();

// Back-url base para los redirect de Mercado Pago: usa el origin del request
// (el Nginx público), con fallback a SystemSetting.mercadopago.back_url_base.
function backBase(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return `${proto}://${host}`;
}

function genQrCode() {
  return 'AE' + randomBytes(7).toString('hex').toUpperCase();
}

async function uniqueQr() {
  for (let i = 0; i < 8; i++) {
    const code = genQrCode();
    const exists = await prisma.ticket.findUnique({ where: { qr_code: code }, select: { id: true } });
    if (!exists) return code;
  }
  // colisión extremadamente improbable: agrego timestamp
  return 'AE' + Date.now().toString(36).toUpperCase() + randomBytes(3).toString('hex').toUpperCase();
}

// --- Tienda pública: eventos con venta habilitada y dentro de ventana ---
ticketsPublicRouter.get('/events', async (req, res, next) => {
  try {
    const now = new Date();
    const sales = await prisma.ticketSale.findMany({
      where: { enabled: true, OR: [{ open_at: null }, { open_at: { lte: now } }] },
    });
    // filtrar los que ya cerraron
    const valid = sales.filter((s) => !s.close_at || new Date(s.close_at) >= now);
    const eventIds = valid.map((s) => s.event_id);
    if (eventIds.length === 0) return res.json([]);
    const events = await prisma.event.findMany({ where: { id: { in: eventIds } } });
    const bySale = new Map(valid.map((s) => [s.event_id, s]));
    const out = events.map((e) => {
      const sale = bySale.get(e.id);
      return {
        id: e.id, name: e.name, venue: e.venue, logo_url: e.logo_url,
        start_at: e.start_at, end_at: e.end_at,
        description: sale?.description || '', address: sale?.address || '', image_url: sale?.image_url || '',
      };
    });
    res.json(out);
  } catch (e) { next(e); }
});

ticketsPublicRouter.get('/events/:id', async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    const sale = await prisma.ticketSale.findFirst({ where: { event_id: event.id } });
    const now = new Date();
    const open = !sale?.open_at || new Date(sale.open_at) <= now;
    const close = sale?.close_at && new Date(sale.close_at) < now;
    const types = await prisma.ticketType.findMany({
      where: { event_id: event.id, status: 'active' },
      orderBy: { sort_order: 'asc' },
    });
    res.json({
      id: event.id, name: event.name, venue: event.venue, logo_url: event.logo_url,
      start_at: event.start_at, end_at: event.end_at,
      sale: sale ? { enabled: sale.enabled, open, closed: close, description: sale.description, address: sale.address, terms: sale.terms, image_url: sale.image_url } : null,
      ticket_types: types.map((t) => ({
        id: t.id, name: t.name, description: t.description, price: t.price,
        capacity: t.capacity, available: Math.max(0, t.capacity - t.sold),
        limit_per_purchase: t.limit_per_purchase,
      })),
    });
  } catch (e) { next(e); }
});

// --- Crear orden: reserva atómica anti-oversell + preferencia Mercado Pago ---
ticketsPublicRouter.post('/orders', async (req, res, next) => {
  try {
    const { event_id, ticket_type_id, buyer_name, buyer_dni, buyer_email, buyer_phone, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity || 1, 10));
    if (!event_id || !ticket_type_id || !buyer_name) {
      return res.status(400).json({ error: 'Faltan datos obligatorios (evento, tipo de entrada, nombre).' });
    }
    const event = await prisma.event.findUnique({ where: { id: event_id } });
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    const tt = await prisma.ticketType.findUnique({ where: { id: ticket_type_id } });
    if (!tt || tt.event_id !== event_id || tt.status !== 'active') {
      return res.status(404).json({ error: 'Tipo de entrada no disponible.' });
    }
    if (qty > (tt.limit_per_purchase || 10)) {
      return res.status(400).json({ error: `Máximo ${tt.limit_per_purchase || 10} entradas por compra.` });
    }
    // Reserva atómica: UPDATE ticket_types SET sold = sold + qty WHERE sold + qty <= capacity
    const updated = await prisma.$executeRaw`
      UPDATE ticket_types SET sold = sold + ${qty} WHERE id = ${tt.id} AND sold + ${qty} <= capacity`;
    if (updated === 0) {
      return res.status(409).json({ error: 'Sin stock disponible para esta entrada.' });
    }
    const qr_code = await uniqueQr();
    const total = Number(tt.price) * qty;
    const ticket = await prisma.ticket.create({
      data: {
        event_id: event.id, event_name: event.name, company: event.company,
        ticket_type_id: tt.id, ticket_type_name: tt.name,
        buyer_name, buyer_dni: buyer_dni || null, buyer_email: buyer_email || null, buyer_phone: buyer_phone || null,
        quantity: qty, unit_price: Number(tt.price), total, status: 'pending', qr_code,
      },
    });
    broadcast('Ticket', { id: ticket.id, type: 'create', data: ticket });
    try {
      const cfg = await getMpConfig();
      const pref = await createPreference({
        ticket, event, ticketType: tt,
        backBase: cfg.backUrlBase || backBase(req),
        webhookUrl: cfg.webhookUrl,
        sandbox: cfg.sandbox,
      });
      res.json({
        ticket_id: ticket.id, qr_code,
        init_point: cfg.sandbox ? pref.sandbox_init_point : pref.init_point,
        sandbox: !!cfg.sandbox,
      });
    } catch (err) {
      // Si MP falla, liberamos el stock y cancelamos la entrada para no quedarnos con pendientes huérfanos.
      await prisma.$executeRaw`UPDATE ticket_types SET sold = sold - ${qty} WHERE id = ${tt.id}`;
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'cancelled' } });
      broadcast('Ticket', { id: ticket.id, type: 'update', data: { ...ticket, status: 'cancelled' } });
      res.status(502).json({ error: `No se pudo iniciar el pago: ${err.message}` });
    }
  } catch (e) { next(e); }
});

// --- Consulta pública de una entrada por id (página de confirmación) ---
ticketsPublicRouter.get('/:id', async (req, res, next) => {
  try {
    const t = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.json({
      id: t.id, status: t.status, qr_code: t.qr_code, buyer_name: t.buyer_name,
      buyer_dni: t.buyer_dni, ticket_type_name: t.ticket_type_name, quantity: t.quantity,
      total: t.total, event_name: t.event_name, used_at: t.used_at, payment_id: t.payment_id,
    });
  } catch (e) { next(e); }
});

// --- Dashboard admin: stats por evento ---
ticketsAdminRouter.get('/stats', async (req, res, next) => {
  try {
    const { event_id } = req.query;
    const where = event_id ? { event_id } : {};
    const [paid, pending, used, refunded, cancelled, sumAgg, types] = await Promise.all([
      prisma.ticket.count({ where: { ...where, status: 'paid' } }),
      prisma.ticket.count({ where: { ...where, status: 'pending' } }),
      prisma.ticket.count({ where: { ...where, status: 'used' } }),
      prisma.ticket.count({ where: { ...where, status: 'refunded' } }),
      prisma.ticket.count({ where: { ...where, status: 'cancelled' } }),
      prisma.ticket.aggregate({ where: { ...where, status: { in: ['paid', 'used'] } }, _sum: { total: true }, _count: true }),
      prisma.ticketType.findMany({ where: event_id ? { event_id } : {}, orderBy: { sort_order: 'asc' } }),
    ]);
    const byType = types.map((tt) => ({
      id: tt.id, name: tt.name, price: tt.price, capacity: tt.capacity, sold: tt.sold,
      available: Math.max(0, tt.capacity - tt.sold),
    }));
    res.json({
      counts: { paid, pending, used, refunded, cancelled, total: paid + pending + used + refunded + cancelled },
      revenue: sumAgg._sum.total || 0,
      sold_count: sumAgg._count || 0,
      by_type: byType,
    });
  } catch (e) { next(e); }
});

// --- Dashboard admin: export CSV de entradas por evento ---
ticketsAdminRouter.get('/export', async (req, res, next) => {
  try {
    const { event_id } = req.query;
    const where = event_id ? { event_id } : {};
    const tickets = await prisma.ticket.findMany({ where, orderBy: { created_at: 'desc' } });
    const header = ['qr_code', 'buyer_name', 'buyer_dni', 'buyer_email', 'buyer_phone', 'ticket_type_name', 'quantity', 'unit_price', 'total', 'status', 'payment_id', 'used_at', 'event_name'];
    const rows = tickets.map((t) => header.map((k) => {
      const v = t[k];
      if (v instanceof Date) return v.toISOString();
      return `"${String(v ?? '').replace(/"/g, '""')}"`;
    }).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="entradas${event_id ? '' : '-todas'}.csv"`);
    res.send([header.join(','), ...rows].join('\n'));
  } catch (e) { next(e); }
});

// --- Validación en puerta (auth): escanea QR de la entrada ---
ticketAccessRouter.post('/validate', async (req, res, next) => {
  try {
    const { qr_code, event_id } = req.body;
    if (!qr_code) return res.status(400).json({ ok: false, message: 'Falta código QR.' });
    const ticket = await prisma.ticket.findUnique({ where: { qr_code: String(qr_code).trim() } });
    const event = event_id ? await prisma.event.findUnique({ where: { id: event_id } }) : null;
    if (!ticket || (event_id && ticket.event_id !== event_id)) {
      await logTicketAccess(req.user, event || { id: ticket?.event_id || '', name: '' }, null, { ok: false, reason: 'not_found' }, qr_code);
      return res.json({ ok: false, reason: 'not_found', message: 'Entrada no encontrada.' });
    }
    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      await logTicketAccess(req.user, event, ticket, { ok: false, reason: 'blocked' }, qr_code);
      return res.json({ ok: false, reason: 'blocked', message: 'Entrada cancelada o reembolsada.' });
    }
    if (ticket.status === 'pending') {
      await logTicketAccess(req.user, event, ticket, { ok: false, reason: 'pending' }, qr_code);
      return res.json({ ok: false, reason: 'pending', message: 'Entrada pendiente de pago.' });
    }
    if (ticket.status === 'used') {
      await logTicketAccess(req.user, event, ticket, { ok: false, reason: 'used' }, qr_code);
      return res.json({ ok: false, reason: 'used', message: `Entrada ya usada.`, used_at: ticket.used_at });
    }
    // status === 'paid' → conceder y marcar usada
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'used', used_at: new Date(), verified_by: req.user ? (req.user.full_name || req.user.email) : null },
    });
    broadcast('Ticket', { id: ticket.id, type: 'update', data: updated });
    await logTicketAccess(req.user, event, ticket, { ok: true }, qr_code);
    res.json({ ok: true, ticket: { id: ticket.id, buyer_name: ticket.buyer_name, ticket_type_name: ticket.ticket_type_name, quantity: ticket.quantity, qr_code: ticket.qr_code } });
  } catch (e) { next(e); }
});

async function logTicketAccess(user, event, ticket, r, qr_code) {
  const entry = {
    accreditation_id: ticket?.id || 'unknown',
    person_name: ticket?.buyer_name || 'Desconocido',
    badge_code: ticket?.qr_code || qr_code || '',
    event_id: event?.id || ticket?.event_id || null,
    event_name: event?.name || ticket?.event_name || '',
    company: ticket?.company || event?.company || null,
    verified_by: user ? (user.full_name || user.email) : null,
    pda_number: null,
    method: 'ticket',
    resource_type: 'person',
    zone: 'Entrada',
    door: 'Ticket',
    result: r.ok ? 'granted' : 'denied',
    denied_reason: r.ok ? '' : (r.reason || ''),
    access_level: ticket?.ticket_type_name || 'Entrada',
  };
  if (canAccess(getPolicy('AccessLog', 'create'), user || {}, entry)) {
    const log = await prisma.accessLog.create({ data: entry });
    broadcast('AccessLog', { id: log.id, type: 'create', data: log });
  }
}