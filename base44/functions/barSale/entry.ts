// POS de barras — crea ventas y maneja pagos (efectivo, tarjeta, QR MP).
// Acciones: create | create_card_intent | poll_intent | confirm | status

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Helper: lee config de MP desde SystemSetting.
    const getMpConfig = async () => {
      const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
      return settings[0]?.mercadopago || {};
    };
    const pointEndpoint = (mp) => (mp.point?.endpoint || 'https://api.mercadopago.com').replace(/\/$/, '');
    const pointToken = (mp) => mp.point?.access_token || mp.access_token;

    // ---- Datos del POS (catálogo + dispositivos) ----
    // Lo usa la tablet para cargar el POS sin depender de RLS (operadores no son
    // usuarios de plataforma). Devuelve barra, evento, productos y terminales.
    if (action === 'get_pos_data') {
      const { bar_id } = body;
      if (!bar_id) return Response.json({ error: 'Falta bar_id' }, { status: 400 });
      const bar = await base44.asServiceRole.entities.Bar.get(bar_id).catch(() => null);
      if (!bar) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
      const [ev, ps, devs] = await Promise.all([
        base44.asServiceRole.entities.Event.get(bar.event_id).catch(() => null),
        base44.asServiceRole.entities.EventProduct.filter({ event_id: bar.event_id, status: 'active' }, 'sort_order', 300),
        base44.asServiceRole.entities.BarPosDevice.filter({ bar_id, status: 'active' }, 'alias', 50),
      ]);
      return Response.json({ bar, event: ev, products: ps, devices: devs });
    }

    // ---- Crear venta ----
    if (action === 'create') {
      const { bar_id, items, payment_method, operator_name, operator_id, client_uuid } = body;
      if (!bar_id || !items || !Array.isArray(items) || items.length === 0)
        return Response.json({ error: 'Faltan datos de la venta' }, { status: 400 });

      const bar = await base44.asServiceRole.entities.Bar.get(bar_id);
      if (!bar) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });

      // Validar operador (si viene): debe existir, estar activo y asignado a esta barra.
      if (operator_id) {
        const ops = await base44.asServiceRole.entities.BarOperator.filter({ id: operator_id }).catch(() => []);
        const op = ops && ops[0];
        if (!op) return Response.json({ error: 'Operador inválido' }, { status: 403 });
        if (op.blocked) return Response.json({ error: 'Operador bloqueado' }, { status: 403 });
        if (op.bar_id !== bar_id) return Response.json({ error: 'El operador no pertenece a esta barra' }, { status: 403 });
      }

      // Idempotencia: si la venta ya se sincronizó (misma client_uuid), devolverla.
      if (client_uuid) {
        const dup = await base44.asServiceRole.entities.BarSale.filter({ client_uuid }).catch(() => []);
        if (dup && dup.length) {
          return Response.json({ sale_id: dup[0].id, status: dup[0].status, total: dup[0].total, demo: false, duplicate: true });
        }
      }

      const calcTotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
      const method = payment_method || 'cash';

      const mp = await getMpConfig();
      const demoMode = mp.demo_mode === true || !mp.access_token;

      const saleData = {
        bar_id,
        bar_name: bar.name,
        event_id: bar.event_id,
        event_name: bar.event_name,
        company: bar.company,
        operator_name: operator_name || 'Operador',
        client_uuid: client_uuid || undefined,
        items: items.map((it) => ({
          name: it.name,
          price: Number(it.price),
          qty: Number(it.qty),
          subtotal: Number(it.price) * Number(it.qty),
        })),
        total: calcTotal,
        payment_method: method,
        status: 'paid',
      };

      // QR con Mercado Pago real: venta pending + preferencia
      if (method === 'qr' && !demoMode) {
        saleData.status = 'pending';
        const sale = await base44.asServiceRole.entities.BarSale.create(saleData);

        const prefBody = {
          items: items.map((it, i) => ({
            id: `item-${i}`,
            title: it.name,
            quantity: Number(it.qty),
            unit_price: Number(it.price),
            currency_id: 'ARS',
          })),
          auto_return: 'approved',
          notification_url: mp.webhook_url,
          external_reference: sale.id,
        };
        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mp.access_token}` },
          body: JSON.stringify(prefBody),
        });
        if (!mpRes.ok) {
          const t = await mpRes.text().catch(() => '');
          await base44.asServiceRole.entities.BarSale.update(sale.id, { status: 'cancelled' });
          return Response.json({ error: 'Mercado Pago: ' + t.slice(0, 200) }, { status: 502 });
        }
        const pref = await mpRes.json();
        const init_point = mp.sandbox ? pref.sandbox_init_point : pref.init_point;
        return Response.json({ sale_id: sale.id, status: 'pending', init_point, total: calcTotal });
      }

      // Tarjeta (posnet Mercado Pago Point): venta pending. La app luego
      // llama a create_card_intent con el device elegido para disparar el
      // cobro en la terminal f\u00edsica. El ticket de cliente lo imprime el
      // propio posnet; ac\u00e1 s\u00f3lo esperamos confirmaci\u00f3n del intent.
      if (method === 'card') {
        saleData.status = 'pending';
        const sale = await base44.asServiceRole.entities.BarSale.create(saleData);
        return Response.json({ sale_id: sale.id, status: 'pending', total: calcTotal, method: 'card', demo: demoMode });
      }

      // Efectivo o modo demo: confirma la venta al instante.
      const sale = await base44.asServiceRole.entities.BarSale.create(saleData);
      return Response.json({ sale_id: sale.id, status: 'paid', total: calcTotal, demo: demoMode });
    }

    // ---- Crear intent de Point (tarjeta f\u00edsica) ----
    // Dispara el cobro en la terminal seleccionada. Requiere venta ya creada
    // como pending con payment_method=card.
    if (action === 'create_card_intent') {
      const { sale_id, device_id } = body;
      if (!sale_id || !device_id)
        return Response.json({ error: 'Faltan sale_id o device_id' }, { status: 400 });

      const sale = await base44.asServiceRole.entities.BarSale.get(sale_id).catch(() => null);
      if (!sale) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
      if (sale.payment_method !== 'card')
        return Response.json({ error: 'La venta no es de tarjeta' }, { status: 400 });
      if (sale.status !== 'pending')
        return Response.json({ error: 'La venta ya no est\u00e1 pendiente' }, { status: 400 });

      const mp = await getMpConfig();
      if (!mp.access_token)
        return Response.json({ error: 'Mercado Pago no configurado' }, { status: 500 });

      const device = await base44.asServiceRole.entities.BarPosDevice.get(device_id).catch(() => null);
      if (!device) return Response.json({ error: 'Terminal no encontrada' }, { status: 404 });
      if (!device.device_id)
        return Response.json({ error: 'La terminal no tiene device_id configurado' }, { status: 400 });

      // Point usa el monto en centavos (entero).
      const amount = Math.round(Number(sale.total) * 100);
      const intentBody = {
        amount,
        description: `Barra ${sale.bar_name || ''}`.trim().slice(0, 60),
        external_reference: sale.id,
        payment_mode: mp.point?.payment_mode || 'PASS_THROUGH',
        print_on_terminal: true,
      };
      const endpoint = pointEndpoint(mp);
      const token = pointToken(mp);

      const intentRes = await fetch(`${endpoint}/point/integration-api/devices/${device.device_id}/payment-intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': sale.id },
        body: JSON.stringify(intentBody),
      });
      if (!intentRes.ok) {
        const t = await intentRes.text().catch(() => '');
        return Response.json({ error: 'Point: ' + t.slice(0, 300) }, { status: 502 });
      }
      const intent = await intentRes.json();
      const intentId = intent.id;

      await base44.asServiceRole.entities.BarSale.update(sale_id, {
        point_intent_id: intentId,
        point_device_id: device.device_id,
      });
      // Marca la terminal como usada (no bloqueante).
      base44.asServiceRole.entities.BarPosDevice.update(device_id, { last_used: new Date().toISOString() }).catch(() => {});

      return Response.json({
        sale_id,
        intent_id: intentId,
        state: intent.state || 'open',
        device_alias: device.alias,
      });
    }

    // ---- Polling del estado del intent de Point ----
    // Consulta el estado del intent y mapea a estado de la venta.
    // result: pending | approved | rejected
    if (action === 'poll_intent') {
      const { sale_id } = body;
      if (!sale_id) return Response.json({ error: 'Falta sale_id' }, { status: 400 });

      const sale = await base44.asServiceRole.entities.BarSale.get(sale_id).catch(() => null);
      if (!sale) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
      if (!sale.point_intent_id)
        return Response.json({ error: 'La venta no tiene intent de Point' }, { status: 400 });

      const mp = await getMpConfig();
      if (!mp.access_token)
        return Response.json({ error: 'Mercado Pago no configurado' }, { status: 500 });
      const endpoint = pointEndpoint(mp);
      const token = pointToken(mp);

      const r = await fetch(`${endpoint}/point/integration-api/intents/${sale.point_intent_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return Response.json({ error: 'No se pudo consultar el intent de Point' }, { status: 502 });
      const intent = await r.json();
      const state = intent.state;

      let result = 'pending';
      let saleStatus = sale.status;
      if (state === 'finished' || state === 'process_authorized') {
        result = 'approved';
        saleStatus = 'paid';
      } else if (state === 'process_denied' || state === 'canceled') {
        result = 'rejected';
        saleStatus = 'cancelled';
      }

      if (saleStatus !== sale.status) {
        await base44.asServiceRole.entities.BarSale.update(sale_id, { status: saleStatus });
      }
      return Response.json({
        sale_id,
        state,
        result,
        status: saleStatus,
        payment: intent.payment || null,
      });
    }

    // ---- Confirmar pago manualmente (respaldo tarjeta / fallback QR) ----
    if (action === 'confirm') {
      const { sale_id } = body;
      if (!sale_id) return Response.json({ error: 'Falta sale_id' }, { status: 400 });
      const sale = await base44.asServiceRole.entities.BarSale.get(sale_id);
      if (!sale) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
      if (sale.status !== 'paid') {
        await base44.asServiceRole.entities.BarSale.update(sale_id, {
          status: 'paid',
          manual_confirm: sale.payment_method === 'card',
        });
      }
      return Response.json({ sale_id, status: 'paid' });
    }

    // ---- Consultar estado (polling QR) ----
    if (action === 'status') {
      const { sale_id } = body;
      if (!sale_id) return Response.json({ error: 'Falta sale_id' }, { status: 400 });
      const sale = await base44.asServiceRole.entities.BarSale.get(sale_id);
      if (!sale) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
      return Response.json({ sale_id, status: sale.status, total: sale.total });
    }

    return Response.json({ error: 'Acci\u00f3n inv\u00e1lida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}