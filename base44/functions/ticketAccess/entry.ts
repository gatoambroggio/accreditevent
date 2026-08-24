// Validación de entradas en puerta (Base44). Requiere operador autenticado.
// Soporta QR dinámico (TOTP, rota cada 30s) y QR estático de respaldo.
// Valida etapas de control configurables (pre-ingreso, ingreso, VIP, ...).
// Acciones: stages | validate.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { decodeDynamicQr, verifyTotp } from '../../shared/totp.ts';

const DEFAULT_STAGES = [
  { value: 'pre_ingreso', label: 'Pre-ingreso' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'ingreso_vip', label: 'Ingreso VIP' },
];

async function getStages(base44, eventId) {
  try {
    const sales = await base44.asServiceRole.entities.TicketSale.filter({ event_id: eventId });
    const stages = sales[0]?.validation_stages;
    return stages && stages.length ? stages : DEFAULT_STAGES;
  } catch {
    return DEFAULT_STAGES;
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, message: 'No autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ---- Listar etapas configuradas para un evento ----
    if (action === 'stages') {
      const { event_id } = body;
      if (!event_id) return Response.json({ ok: false, message: 'Falta event_id' }, { status: 400 });
      const stages = await getStages(base44, event_id);
      return Response.json({ ok: true, stages });
    }

    // ---- Validar un QR en una etapa ----
    if (action !== 'validate') return Response.json({ ok: false, message: 'Acción inválida' }, { status: 400 });

    const { qr_code, event_id, stage } = body;
    if (!qr_code || !event_id) return Response.json({ ok: false, message: 'Faltan datos' }, { status: 400 });

    // Resolver la entrada: QR dinámico (TOTP) o QR estático de respaldo.
    const dyn = decodeDynamicQr(qr_code);
    let t;
    let dynamicVerified = false;
    if (dyn) {
      try { t = await base44.asServiceRole.entities.Ticket.get(dyn.ticketId); } catch {}
      if (!t) return Response.json({ ok: false, message: 'Entrada no encontrada' });
      if (!t.qr_secret) return Response.json({ ok: false, message: 'Entrada sin QR dinámico configurado' });
      const ok = await verifyTotp(t.qr_secret, dyn.code, 1);
      if (!ok) return Response.json({ ok: false, message: 'Código de QR expirado o inválido' });
      dynamicVerified = true;
    } else {
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ qr_code });
      t = tickets && tickets[0];
      if (!t) return Response.json({ ok: false, message: 'Entrada no encontrada' });
    }

    if (t.event_id !== event_id) return Response.json({ ok: false, message: 'La entrada no corresponde a este evento' });
    if (t.status === 'cancelled') return Response.json({ ok: false, message: 'Entrada cancelada' });
    if (t.status === 'refunded') return Response.json({ ok: false, message: 'Entrada reembolsada' });
    if (t.status !== 'paid' && t.status !== 'used') return Response.json({ ok: false, message: `Estado: ${t.status}` });

    const stages = await getStages(base44, event_id);
    const stageValues = stages.map((s) => s.value);

    // Sin etapas configuradas: comportamiento legacy (un solo escaneo => used).
    if (!stage || !stageValues.includes(stage)) {
      if (stageValues.length === 0 || !stage) return Response.json({ ok: false, message: 'Elegí una etapa de control' });
      return Response.json({ ok: false, message: 'Etapa inválida' });
    }

    const passed = t.stages_passed || [];
    const idx = stageValues.indexOf(stage);

    // Etapas previas requeridas en orden.
    for (let i = 0; i < idx; i++) {
      if (!passed.includes(stageValues[i])) {
        const prev = stages[i].label;
        return Response.json({ ok: false, message: `Falta validar la etapa anterior: ${prev}` });
      }
    }

    if (passed.includes(stage)) {
      const label = stages[idx].label;
      return Response.json({ ok: false, message: `Ya validado en ${label}` });
    }

    const newPassed = [...passed, stage];
    const isLast = idx === stageValues.length - 1;
    const update = {
      stages_passed: newPassed,
      verified_by: user.email || user.id,
    };
    if (isLast) {
      update.status = 'used';
      update.used_at = new Date().toISOString();
    }
    await base44.asServiceRole.entities.Ticket.update(t.id, update);

    return Response.json({
      ok: true,
      dynamic: dynamicVerified,
      stage: stages[idx],
      stages_passed: newPassed,
      stages_remaining: stageValues.filter((v) => !newPassed.includes(v)),
      is_final: isLast,
      ticket: {
        buyer_name: t.buyer_name,
        buyer_dni: t.buyer_dni,
        ticket_type_name: t.ticket_type_name,
        quantity: t.quantity,
        qr_code: t.qr_code,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, message: error.message || 'Error interno' }, { status: 500 });
  }
}