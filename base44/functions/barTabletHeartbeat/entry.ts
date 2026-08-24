// Heartbeat de tablets de barra para monitoreo remoto (batería, online/offline).
// La tablet no tiene sesión de plataforma: el POS llama a esta función con su
// device_id (UUID local) y bar_id. Se hace upsert por device_id usando service role.
// Acciones: heartbeat | offline

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = (body.action || 'heartbeat').toString();

    async function resolveBar(barId: string) {
      if (!barId) return null;
      let bar: any = null;
      try {
        const bars = await base44.asServiceRole.entities.Bar.filter({ id: barId });
        if (bars && bars.length) bar = bars[0];
      } catch {}
      let event: any = null;
      if (bar && bar.event_id) {
        try {
          const evs = await base44.asServiceRole.entities.Event.filter({ id: bar.event_id });
          if (evs && evs.length) event = evs[0];
        } catch {}
      }
      return { bar, event, company: (bar?.company || event?.company || '') };
    }

    if (action === 'heartbeat') {
      const device_id = (body.device_id || '').toString().trim();
      const bar_id = (body.bar_id || '').toString().trim();
      if (!device_id || !bar_id) {
        return Response.json({ error: 'device_id y bar_id son obligatorios' }, { status: 400 });
      }
      const resolved = await resolveBar(bar_id);
      if (!resolved || !resolved.bar) {
        return Response.json({ error: 'Barra no encontrada' }, { status: 404 });
      }
      const { bar, event, company } = resolved;
      const payload: any = {
        device_id,
        bar_id,
        bar_name: bar.name || '',
        event_id: bar.event_id || '',
        event_name: event?.name || bar.event_name || '',
        company,
        operator_id: (body.operator_id || '').toString(),
        operator_name: (body.operator_name || '').toString(),
        last_seen: new Date().toISOString(),
        battery_level: body.battery_level == null ? null : Math.max(0, Math.min(100, Number(body.battery_level))),
        charging: !!body.charging,
        pending_sync: Math.max(0, Number(body.pending_sync || 0)),
        status: 'active',
      };

      const existing = await base44.asServiceRole.entities.BarTablet.filter({ device_id });
      if (existing && existing.length) {
        await base44.asServiceRole.entities.BarTablet.update(existing[0].id, payload);
        return Response.json({ ok: true, id: existing[0].id });
      }
      payload.alias = (body.alias || `Tablet ${bar.name || ''}`).trim();
      const created = await base44.asServiceRole.entities.BarTablet.create(payload);
      return Response.json({ ok: true, id: created.id });
    }

    if (action === 'offline') {
      const device_id = (body.device_id || '').toString().trim();
      if (!device_id) return Response.json({ error: 'device_id obligatorio' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.BarTablet.filter({ device_id });
      if (existing && existing.length) {
        await base44.asServiceRole.entities.BarTablet.update(existing[0].id, {
          last_seen: new Date().toISOString(),
          pending_sync: Math.max(0, Number(body.pending_sync || 0)),
        });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Error en heartbeat de tablet' }, { status: 500 });
  }
}