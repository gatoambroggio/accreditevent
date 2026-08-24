// POS de barras — crea ventas y maneja pagos (efectivo, tarjeta, QR MP).
// Acciones: create | confirm | status

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- Crear venta ----
    if (action === 'create') {
      const { bar_id, items, payment_method, operator_name } = body;
      if (!bar_id || !items || !Array.isArray(items) || items.length === 0)
        return Response.json({ error: 'Faltan datos de la venta' }, { status: 400 });

      const bar = await base44.asServiceRole.entities.Bar.get(bar_id);
      if (!bar) return Response.json({ error: 'Barra no encontrada' }, { status: 404 });

      const calcTotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
      const method = payment_method || 'cash';

      // MP config
      const settings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 1);
      const mp = settings[0]?.mercadopago || {};
      const demoMode = mp.demo_mode === true || !mp.access_token;

      const saleData = {
        bar_id,
        bar_name: bar.name,
        event_id: bar.event_id,
        event_name: bar.event_name,
        company: bar.company,
        operator_name: operator_name || 'Operador',
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
          // Si MP falla, cancelamos la venta pending para no dejarla colgada.
          await base44.asServiceRole.entities.BarSale.update(sale.id, { status: 'cancelled' });
          return Response.json({ error: 'Mercado Pago: ' + t.slice(0, 200) }, { status: 502 });
        }
        const pref = await mpRes.json();
        const init_point = mp.sandbox ? pref.sandbox_init_point : pref.init_point;
        return Response.json({ sale_id: sale.id, status: 'pending', init_point, total: calcTotal });
      }

      // Tarjeta (posnet Mercado Pago Point): venta pending hasta que el
      // operador confirme el pago en la terminal física. El ticket de cliente
      // lo imprime el propio posnet, así que acá sólo esperamos confirmación.
      if (method === 'card') {
        saleData.status = 'pending';
        const sale = await base44.asServiceRole.entities.BarSale.create(saleData);
        return Response.json({ sale_id: sale.id, status: 'pending', total: calcTotal, method: 'card' });
      }

      // Efectivo o modo demo: confirma la venta al instante.
      const sale = await base44.asServiceRole.entities.BarSale.create(saleData);
      return Response.json({ sale_id: sale.id, status: 'paid', total: calcTotal, demo: demoMode });
    }

    // ---- Confirmar pago manualmente (fallback QR) ----
    if (action === 'confirm') {
      const { sale_id } = body;
      if (!sale_id) return Response.json({ error: 'Falta sale_id' }, { status: 400 });
      const sale = await base44.asServiceRole.entities.BarSale.get(sale_id);
      if (!sale) return Response.json({ error: 'Venta no encontrada' }, { status: 404 });
      if (sale.status !== 'paid') {
        await base44.asServiceRole.entities.BarSale.update(sale_id, { status: 'paid' });
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

    return Response.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}