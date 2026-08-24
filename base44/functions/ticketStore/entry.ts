// Tienda pública de entradas (Base44). Función anónima: los compradores no
// tienen login. Usa asServiceRole para leer/crear Tickets, TicketType,
// TicketSale, Event y SystemSetting (config de Mercado Pago).
// Acciones: list | event | order | ticket.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { randomHex } from '../../shared/totp.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- Listar eventos con venta publicada ----
    if (action === 'list') {
      const sales = await base44.asServiceRole.entities.TicketSale.filter({ enabled: true });
      if (!sales || sales.length === 0) return Response.json([]);
      const ids = sales.map((s) => s.event_id).filter(Boolean);
      const events = ids.length ? await base44.asServiceRole.entities.Event.filter({ id: { $in: ids } }) : [];
      const result = events.map((ev) => {
        const sale = sales.find((s) => s.event_id === ev.id);
        return {
          id: ev.id,
          name: ev.name,
          venue: ev.venue,
          start_at: ev.start_at,
          description: sale?.description,
          address: sale?.address,
          image_url: sale?.image_url,
        };
      });
      return Response.json(result);
    }

    // ---- Detalle de evento + tipos de entrada ----
    if (action === 'event') {
      const { event_id } = body;
      if (!event_id) return Response.json({ error: 'Falta event_id' }, { status: 400 });
      const sales = await base44.asServiceRole.entities.TicketSale.filter({ event_id });
      const sale = sales[0];
      const ev = await base44.asServiceRole.entities.Event.get(event_id);
      const types = await base44.asServiceRole.entities.TicketType.filter({ event_id, status: 'active' }, 'sort_order', 200);
      const now = Date.now();
      const open = !!sale?.enabled
        && (!sale.open_at || new Date(sale.open_at).getTime() <= now)
        && (!sale.close_at || new Date(sale.close_at).getTime() >= now);
      const closed = !!sale?.close_at && new Date(sale.close_at).getTime() < now;
      const ticket_types = types.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: t.price,
        available: Math.max(0, (t.capacity || 0) - (t.sold || 0)),
        limit_per_purchase: t.limit_per_purchase || 10,
      }));
      return Response.json({
        id: ev.id,
        name: ev.name,
        venue: ev.venue,
        start_at: ev.start_at,
        sale: {
          enabled: !!sale?.enabled,
          open,
          closed,
          description: sale?.description,
          address: sale?.address,
          terms: sale?.terms,
        },
        ticket_types,
      });
    }

    // ---- Crear orden + preferencia de Mercado Pago ----
    if (action === 'order') {
      const { event_id, ticket_type_id, quantity, buyer_name, buyer_dni, buyer_email, buyer_phone, app_base_url } = body;
      if (!event_id || !ticket_type_id || !buyer_name) return Response.json({ error: 'Faltan datos obligatorios' }, { status: 400 });
      const qty = Math.max(1, Math.min(20, Number(quantity) || 1));

      const sales = await base44.asServiceRole.entities.TicketSale.filter({ event_id });
      const sale = sales[0];
      if (!sale?.enabled) return Response.json({ error: 'La venta no está habilitada' }, { status: 400 });
      const now = Date.now();
      if (sale.open_at && new Date(sale.open_at).getTime() > now) return Response.json({ error: 'La venta aún no abrió' }, { status: 400 });
      if (sale.close_at && new Date(sale.close_at).getTime() < now) return Response.json({ error: 'La venta finalizó' }, { status: 400 });

      const type = await base44.asServiceRole.entities.TicketType.get(ticket_type_id);
      if (!type || type.event_id !== event_id) return Response.json({ error: 'Tipo de entrada inválido' }, { status: 400 });
      if (type.status !== 'active') return Response.json({ error: 'Tipo de entrada no disponible' }, { status: 400 });
      if (qty > (type.limit_per_purchase || 10)) return Response.json({ error: 'Excede el máximo por compra' }, { status: 400 });
      const available = Math.max(0, (type.capacity || 0) - (type.sold || 0));
      if (qty > available) return Response.json({ error: 'No hay disponibilidad suficiente' }, { status: 400 });

      const ev = await base44.asServiceRole.entities.Event.get(event_id);

      // Reservar stock y crear el ticket en estado pending.
      await base44.asServiceRole.entities.TicketType.update(ticket_type_id, { sold: (type.sold || 0) + qty });
      const qr = 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const secret = randomHex(20);
      const ticket = await base44.asServiceRole.entities.Ticket.create({
        event_id,
        event_name: ev.name,
        company: ev.company,
        ticket_type_id,
        ticket_type_name: type.name,
        buyer_name,
        buyer_dni: buyer_dni || '',
        buyer_email: buyer_email || '',
        buyer_phone: buyer_phone || '',
        quantity: qty,
        unit_price: type.price,
        total: Number(type.price) * qty,
        status: 'pending',
        qr_code: qr,
        qr_secret: secret,
        stages_passed: [],
      });

      // Crear la preferencia de Mercado Pago.
      const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
      const mp = settings[0]?.mercadopago || {};
      const demoMode = mp.demo_mode === true || !mp.access_token;
      if (demoMode) {
        // Modo demo: confirma la entrada sin cobrar. Útil para probar el flujo
        // completo (QR + confirmación) sin credenciales reales de Mercado Pago.
        await base44.asServiceRole.entities.Ticket.update(ticket.id, { status: 'paid' });
        return Response.json({ ticket_id: ticket.id, demo: true });
      }
      const backBase = mp.back_url_base || app_base_url || '';
      const prefBody = {
        items: [{
          id: ticket_type_id,
          title: `${ev.name} - ${type.name}`,
          quantity: qty,
          unit_price: Number(type.price),
          currency_id: 'ARS',
        }],
        back_urls: {
          success: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=success`,
          failure: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=failure`,
          pending: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=pending`,
        },
        auto_return: 'approved',
        notification_url: mp.webhook_url,
        external_reference: ticket.id,
      };
      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mp.access_token}` },
        body: JSON.stringify(prefBody),
      });
      if (!mpRes.ok) {
        const t = await mpRes.text().catch(() => '');
        await base44.asServiceRole.entities.TicketType.update(ticket_type_id, { sold: Math.max(0, (type.sold || 0)) });
        await base44.asServiceRole.entities.Ticket.update(ticket.id, { status: 'cancelled' });
        return Response.json({ error: 'Mercado Pago: ' + t.slice(0, 200) }, { status: 502 });
      }
      const pref = await mpRes.json();
      const init_point = mp.sandbox ? pref.sandbox_init_point : pref.init_point;
      return Response.json({ init_point, ticket_id: ticket.id });
    }

    // ---- Consultar entrada (para la pantalla de confirmación) ----
    if (action === 'ticket') {
      const { ticket_id } = body;
      if (!ticket_id) return Response.json({ error: 'Falta ticket_id' }, { status: 400 });
      const t = await base44.asServiceRole.entities.Ticket.get(ticket_id);
      if (!t) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 });
      // validation_stages del evento para mostrar progreso de etapas en la confirmación.
      let validation_stages = [];
      try {
        const sales = await base44.asServiceRole.entities.TicketSale.filter({ event_id: t.event_id });
        const st = sales[0]?.validation_stages;
        validation_stages = st && st.length ? st : [
          { value: 'pre_ingreso', label: 'Pre-ingreso' },
          { value: 'ingreso', label: 'Ingreso' },
          { value: 'ingreso_vip', label: 'Ingreso VIP' },
        ];
      } catch {}
      return Response.json({
        id: t.id,
        status: t.status,
        event_name: t.event_name,
        ticket_type_name: t.ticket_type_name,
        qr_code: t.qr_code,
        qr_secret: t.qr_secret || '',
        stages_passed: t.stages_passed || [],
        validation_stages,
        buyer_name: t.buyer_name,
        buyer_dni: t.buyer_dni,
        quantity: t.quantity,
        total: t.total,
      });
    }

    return Response.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}