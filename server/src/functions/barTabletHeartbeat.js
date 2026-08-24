// Heartbeat de tablets de barra para monitoreo remoto (batería, online/offline).
// La tablet no tiene sesión de plataforma: el POS llama a esta función con su
// device_id y bar_id. Upsert por device_id. Se expone en /api/bar-fn (público).
// Acciones: heartbeat | offline

export async function barTabletHeartbeat(body, { prisma }) {
  const action = (body.action || 'heartbeat').toString();

  async function resolveBar(barId) {
    if (!barId) return null;
    const bar = await prisma.bar.findUnique({ where: { id: barId } }).catch(() => null);
    if (!bar) return null;
    let event = null;
    if (bar.event_id) {
      event = await prisma.event.findUnique({ where: { id: bar.event_id } }).catch(() => null);
    }
    return { bar, event, company: (bar.company || event?.company || '') };
  }

  if (action === 'heartbeat') {
    const device_id = (body.device_id || '').toString().trim();
    const bar_id = (body.bar_id || '').toString().trim();
    if (!device_id || !bar_id) {
      return { error: 'device_id y bar_id son obligatorios', status: 400 };
    }
    const resolved = await resolveBar(bar_id);
    if (!resolved || !resolved.bar) return { error: 'Barra no encontrada', status: 404 };
    const { bar, event, company } = resolved;
    const payload = {
      device_id,
      bar_id,
      bar_name: bar.name || '',
      event_id: bar.event_id || '',
      event_name: event?.name || bar.event_name || '',
      company,
      operator_id: (body.operator_id || '').toString(),
      operator_name: (body.operator_name || '').toString(),
      last_seen: new Date(),
      battery_level: body.battery_level == null ? null : Math.max(0, Math.min(100, Number(body.battery_level))),
      charging: !!body.charging,
      pending_sync: Math.max(0, Number(body.pending_sync || 0)),
      status: 'active',
    };
    const existing = await prisma.barTablet.findFirst({ where: { device_id } });
    if (existing) {
      await prisma.barTablet.update({ where: { id: existing.id }, data: payload });
      return { ok: true, id: existing.id };
    }
    payload.alias = (body.alias || `Tablet ${bar.name || ''}`).trim();
    const created = await prisma.barTablet.create({ data: payload });
    return { ok: true, id: created.id };
  }

  if (action === 'offline') {
    const device_id = (body.device_id || '').toString().trim();
    if (!device_id) return { error: 'device_id obligatorio', status: 400 };
    const existing = await prisma.barTablet.findFirst({ where: { device_id } });
    if (existing) {
      await prisma.barTablet.update({
        where: { id: existing.id },
        data: { last_seen: new Date(), pending_sync: Math.max(0, Number(body.pending_sync || 0)) },
      });
    }
    return { ok: true };
  }

  return { error: 'Acción inválida', status: 400 };
}