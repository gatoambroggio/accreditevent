// POS de barras — versión servidor local (Prisma). Crea ventas y maneja pagos
// (efectivo, tarjeta Point, QR MP) + caja (apertura/retiro/cierre). Se expone en
// /api/bar-fn (público, sin token de plataforma): la tablet envía operator_id en
// el payload y la función valida contra BarOperator.
// Acciones: get_pos_data | create | create_card_intent | poll_intent | confirm |
// status | get_cash_status | open_cash | withdraw_cash | close_cash

import { issueCaeForSale } from './_afip.js';

// Intenta emitir el CAE de AFIP para una venta ya pagada y actualiza el registro.
// Respeta el modo de la empresa productora (production/sandbox/disabled). No
// bloquea la venta ante fallos: si no hay config/internet, queda 'pending'.
async function settleAfip(prisma, sale) {
  try {
    const res = await issueCaeForSale(prisma, sale);
    await prisma.barSale.update({
      where: { id: sale.id },
      data: {
        afip_estado: res.estado,
        afip_cae: res.cae || null,
        afip_cae_vto: res.cae_vto || null,
        afip_cae_tipo: res.cae_tipo || null,
        afip_pto_vta: res.pto_vta ?? null,
        afip_error: res.error || null,
      },
    }).catch(() => {});
    return { afip_estado: res.estado, afip_cae: res.cae || null };
  } catch {
    return { afip_estado: 'pending' };
  }
}

async function getMpConfig(prisma) {
  const s = await prisma.systemSetting.findFirst();
  return s?.mercadopago || {};
}
const pointEndpoint = (mp) => (mp.point?.endpoint || 'https://api.mercadopago.com').replace(/\/$/, '');
const pointToken = (mp) => mp.point?.access_token || mp.access_token;

export async function barSale(body, { prisma }) {
  const action = body.action;

  // ---- Datos del POS (catálogo + dispositivos) ----
  if (action === 'get_pos_data') {
    const { bar_id } = body;
    if (!bar_id) return { error: 'Falta bar_id', status: 400 };
    const bar = await prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };
    const [ev, ps, devs] = await Promise.all([
      prisma.event.findUnique({ where: { id: bar.event_id } }).catch(() => null),
      prisma.eventProduct.findMany({ where: { event_id: bar.event_id, status: 'active' }, orderBy: { sort_order: 'asc' }, take: 300 }),
      prisma.barPosDevice.findMany({ where: { bar_id, status: 'active' }, orderBy: { alias: 'asc' }, take: 50 }),
    ]);
    return { bar, event: ev, products: ps, devices: devs };
  }

  // ---- Crear venta ----
  if (action === 'create') {
    const { bar_id, items, payment_method, operator_name, operator_id, client_uuid } = body;
    if (!bar_id || !items || !Array.isArray(items) || items.length === 0) {
      return { error: 'Faltan datos de la venta', status: 400 };
    }
    const bar = await prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };

    if (operator_id) {
      const op = await prisma.barOperator.findUnique({ where: { id: operator_id } }).catch(() => null);
      if (!op) return { error: 'Operador inválido', status: 403 };
      if (op.blocked) return { error: 'Operador bloqueado', status: 403 };
      if (op.bar_id !== bar_id) return { error: 'El operador no pertenece a esta barra', status: 403 };
    }

    // Idempotencia por client_uuid.
    if (client_uuid) {
      const dup = await prisma.barSale.findFirst({ where: { client_uuid } }).catch(() => null);
      if (dup) return { sale_id: dup.id, status: dup.status, total: dup.total, demo: false, duplicate: true };
    }

    const calcTotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
    const method = payment_method || 'cash';
    const mp = await getMpConfig(prisma);
    const demoMode = mp.demo_mode === true || !mp.access_token;

    const saleData = {
      bar_id,
      bar_name: bar.name,
      event_id: bar.event_id,
      event_name: bar.event_name,
      company: bar.company,
      operator_name: operator_name || 'Operador',
      client_uuid: client_uuid || null,
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

    // QR con Mercado Pago real: venta pending + preferencia.
    if (method === 'qr' && !demoMode) {
      saleData.status = 'pending';
      const sale = await prisma.barSale.create({ data: saleData });
      const prefBody = {
        items: items.map((it, i) => ({
          id: `item-${i}`, title: it.name, quantity: Number(it.qty), unit_price: Number(it.price), currency_id: 'ARS',
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
        await prisma.barSale.update({ where: { id: sale.id }, data: { status: 'cancelled' } });
        return { error: 'Mercado Pago: ' + t.slice(0, 200), status: 502 };
      }
      const pref = await mpRes.json();
      const init_point = mp.sandbox ? pref.sandbox_init_point : pref.init_point;
      return { sale_id: sale.id, status: 'pending', init_point, total: calcTotal };
    }

    // Tarjeta (posnet Point): venta pending. La app luego crea el intent.
    if (method === 'card') {
      saleData.status = 'pending';
      const sale = await prisma.barSale.create({ data: saleData });
      return { sale_id: sale.id, status: 'pending', total: calcTotal, method: 'card', demo: demoMode };
    }

    // Efectivo o demo: confirma al instante.
    const sale = await prisma.barSale.create({ data: saleData });
    const afip = await settleAfip(prisma, sale);
    return { sale_id: sale.id, status: 'paid', total: calcTotal, demo: demoMode, afip_estado: afip.afip_estado, afip_cae: afip.afip_cae };
  }

  // ---- Crear intent de Point (tarjeta física) ----
  if (action === 'create_card_intent') {
    const { sale_id, device_id } = body;
    if (!sale_id || !device_id) return { error: 'Faltan sale_id o device_id', status: 400 };
    const sale = await prisma.barSale.findUnique({ where: { id: sale_id } }).catch(() => null);
    if (!sale) return { error: 'Venta no encontrada', status: 404 };
    if (sale.payment_method !== 'card') return { error: 'La venta no es de tarjeta', status: 400 };
    if (sale.status !== 'pending') return { error: 'La venta ya no está pendiente', status: 400 };
    const mp = await getMpConfig(prisma);
    if (!mp.access_token) return { error: 'Mercado Pago no configurado', status: 500 };
    const device = await prisma.barPosDevice.findUnique({ where: { id: device_id } }).catch(() => null);
    if (!device) return { error: 'Terminal no encontrada', status: 404 };
    if (!device.device_id) return { error: 'La terminal no tiene device_id configurado', status: 400 };

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
      return { error: 'Point: ' + t.slice(0, 300), status: 502 };
    }
    const intent = await intentRes.json();
    const intentId = intent.id;
    await prisma.barSale.update({ where: { id: sale_id }, data: { point_intent_id: intentId, point_device_id: device.device_id } });
    prisma.barPosDevice.update({ where: { id: device_id }, data: { last_used: new Date() } }).catch(() => {});
    return { sale_id, intent_id: intentId, state: intent.state || 'open', device_alias: device.alias };
  }

  // ---- Polling del estado del intent de Point ----
  if (action === 'poll_intent') {
    const { sale_id } = body;
    if (!sale_id) return { error: 'Falta sale_id', status: 400 };
    const sale = await prisma.barSale.findUnique({ where: { id: sale_id } }).catch(() => null);
    if (!sale) return { error: 'Venta no encontrada', status: 404 };
    if (!sale.point_intent_id) return { error: 'La venta no tiene intent de Point', status: 400 };
    const mp = await getMpConfig(prisma);
    if (!mp.access_token) return { error: 'Mercado Pago no configurado', status: 500 };
    const endpoint = pointEndpoint(mp);
    const token = pointToken(mp);
    const r = await fetch(`${endpoint}/point/integration-api/intents/${sale.point_intent_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { error: 'No se pudo consultar el intent de Point', status: 502 };
    const intent = await r.json();
    const state = intent.state;
    let result = 'pending';
    let saleStatus = sale.status;
    if (state === 'finished' || state === 'process_authorized') { result = 'approved'; saleStatus = 'paid'; }
    else if (state === 'process_denied' || state === 'canceled') { result = 'rejected'; saleStatus = 'cancelled'; }
    if (saleStatus !== sale.status) {
      await prisma.barSale.update({ where: { id: sale_id }, data: { status: saleStatus } });
      if (saleStatus === 'paid') {
        const fresh = await prisma.barSale.findUnique({ where: { id: sale_id } });
        await settleAfip(prisma, fresh);
      }
    }
    return { sale_id, state, result, status: saleStatus, payment: intent.payment || null };
  }

  // ---- Confirmar pago manualmente ----
  if (action === 'confirm') {
    const { sale_id } = body;
    if (!sale_id) return { error: 'Falta sale_id', status: 400 };
    const sale = await prisma.barSale.findUnique({ where: { id: sale_id } }).catch(() => null);
    if (!sale) return { error: 'Venta no encontrada', status: 404 };
    if (sale.status !== 'paid') {
      await prisma.barSale.update({ where: { id: sale_id }, data: { status: 'paid', manual_confirm: sale.payment_method === 'card' } });
      const fresh = await prisma.barSale.findUnique({ where: { id: sale_id } });
      await settleAfip(prisma, fresh);
    }
    return { sale_id, status: 'paid' };
  }

  // ---- Consultar estado (polling QR) ----
  if (action === 'status') {
    const { sale_id } = body;
    if (!sale_id) return { error: 'Falta sale_id', status: 400 };
    const sale = await prisma.barSale.findUnique({ where: { id: sale_id } }).catch(() => null);
    if (!sale) return { error: 'Venta no encontrada', status: 404 };
    return { sale_id, status: sale.status, total: sale.total };
  }

  // ---- Caja: estado actual ----
  if (action === 'get_cash_status') {
    const { bar_id } = body;
    if (!bar_id) return { error: 'Falta bar_id', status: 400 };
    const [bar, movements, sales] = await Promise.all([
      prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null),
      prisma.barCashMovement.findMany({ where: { bar_id }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
      prisma.barSale.findMany({ where: { bar_id, payment_method: 'cash', status: 'paid' }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
    ]);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };
    const active = (movements || []).filter((m) => m.status !== 'void');
    const openTotal = active.filter((m) => m.type === 'open').reduce((s, m) => s + Number(m.amount || 0), 0);
    const withdrawTotal = active.filter((m) => m.type === 'withdraw').reduce((s, m) => s + Number(m.amount || 0), 0);
    const cashSales = (sales || []).reduce((s, sa) => s + Number(sa.total || 0), 0);
    const balance = openTotal - withdrawTotal + cashSales;
    const sessionMoves = active
      .filter((m) => m.type === 'open' || m.type === 'close')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const sessionOpen = sessionMoves.length > 0 && sessionMoves[0].type === 'open';
    return {
      bar_id, balance, open_total: openTotal, withdraw_total: withdrawTotal, cash_sales_total: cashSales,
      session_open: sessionOpen, last_session: sessionMoves[0] || null,
      movements: (movements || []).slice(0, 50),
    };
  }

  // ---- Caja: apertura ----
  if (action === 'open_cash') {
    const { bar_id, amount, operator_id, operator_name, note } = body;
    if (!bar_id) return { error: 'Falta bar_id', status: 400 };
    const amt = Number(amount || 0);
    if (amt < 0) return { error: 'Monto inválido', status: 400 };
    const bar = await prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };
    const mov = await prisma.barCashMovement.create({
      data: {
        bar_id, bar_name: bar.name, event_id: bar.event_id, event_name: bar.event_name, company: bar.company,
        type: 'open', amount: amt, operator_id: operator_id || '', operator_name: operator_name || 'Operador',
        note: note || 'Apertura de caja', balance_after: amt, status: 'active',
      },
    });
    return { ok: true, movement: mov };
  }

  // ---- Caja: retiro de efectivo ----
  if (action === 'withdraw_cash') {
    const { bar_id, amount, responsible_name, responsible_dni, note, operator_id, operator_name } = body;
    if (!bar_id) return { error: 'Falta bar_id', status: 400 };
    const amt = Number(amount || 0);
    if (amt <= 0) return { error: 'El monto del retiro debe ser mayor a 0', status: 400 };
    const bar = await prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };
    const [movements, sales] = await Promise.all([
      prisma.barCashMovement.findMany({ where: { bar_id }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
      prisma.barSale.findMany({ where: { bar_id, payment_method: 'cash', status: 'paid' }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
    ]);
    const active = (movements || []).filter((m) => m.status !== 'void');
    const openTotal = active.filter((m) => m.type === 'open').reduce((s, m) => s + Number(m.amount || 0), 0);
    const withdrawTotal = active.filter((m) => m.type === 'withdraw').reduce((s, m) => s + Number(m.amount || 0), 0);
    const cashSales = (sales || []).reduce((s, sa) => s + Number(sa.total || 0), 0);
    const balanceAfter = openTotal - withdrawTotal + cashSales - amt;
    const mov = await prisma.barCashMovement.create({
      data: {
        bar_id, bar_name: bar.name, event_id: bar.event_id, event_name: bar.event_name, company: bar.company,
        type: 'withdraw', amount: amt, operator_id: operator_id || '', operator_name: operator_name || 'Operador',
        responsible_name: responsible_name || '', responsible_dni: responsible_dni || '',
        note: note || '', balance_after: balanceAfter, status: 'active',
      },
    });
    return { ok: true, movement: mov, balance_after: balanceAfter };
  }

  // ---- Caja: cierre ----
  if (action === 'close_cash') {
    const { bar_id, amount, note, operator_id, operator_name } = body;
    if (!bar_id) return { error: 'Falta bar_id', status: 400 };
    const counted = Number(amount || 0);
    const bar = await prisma.bar.findUnique({ where: { id: bar_id } }).catch(() => null);
    if (!bar) return { error: 'Barra no encontrada', status: 404 };
    const [movements, sales] = await Promise.all([
      prisma.barCashMovement.findMany({ where: { bar_id }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
      prisma.barSale.findMany({ where: { bar_id, payment_method: 'cash', status: 'paid' }, orderBy: { created_at: 'desc' }, take: 500 }).catch(() => []),
    ]);
    const active = (movements || []).filter((m) => m.status !== 'void');
    const openTotal = active.filter((m) => m.type === 'open').reduce((s, m) => s + Number(m.amount || 0), 0);
    const withdrawTotal = active.filter((m) => m.type === 'withdraw').reduce((s, m) => s + Number(m.amount || 0), 0);
    const cashSales = (sales || []).reduce((s, sa) => s + Number(sa.total || 0), 0);
    const expected = openTotal - withdrawTotal + cashSales;
    const mov = await prisma.barCashMovement.create({
      data: {
        bar_id, bar_name: bar.name, event_id: bar.event_id, event_name: bar.event_name, company: bar.company,
        type: 'close', amount: counted, operator_id: operator_id || '', operator_name: operator_name || 'Operador',
        note: note || 'Cierre de caja', balance_after: expected, status: 'active',
      },
    });
    return { ok: true, movement: mov, expected_balance: expected, counted, diff: counted - expected };
  }

  return { error: 'Acción inválida', status: 400 };
}