// Lógica del webhook Dahua — se monta como ruta pública en routes/webhooks.js.
// Recibe eventos push de la terminal y los registra como AccessLog.
export function parseDahuaEvents(raw) {
  const events = [];
  if (!raw) return events;
  raw = raw.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const p of arr) {
        const params = p.params || p;
        const code = params.Code || params.code || '';
        const data = params.Data || params.data || {};
        if (data && typeof data === 'object') events.push({ code, user_id: String(data.UserID ?? data.userID ?? ''), user_name: String(data.UserName ?? ''), result: data.Result ?? data.AttendanceResult ?? 0, card: String(data.CardNo ?? '') });
      }
      return events;
    } catch {}
  }
  const lines = raw.split('\n');
  let current = {};
  for (const line of lines) {
    const m = line.match(/^\s*(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1], val = m[2].trim();
    if (key === 'Code' || key === 'code') { if (current.code) events.push(normKV(current)); current = { code: val }; }
    else if (key === 'data' && val.startsWith('{')) { try { Object.assign(current, JSON.parse(val)); } catch {} }
    else current[key] = val;
  }
  if (current.code || current.UserID) events.push(normKV(current));
  return events;
}
function normKV(o) {
  return { code: o.code || o.Code || '', user_id: String(o.UserID ?? o.userID ?? ''), user_name: String(o.UserName ?? ''), result: Number(o.Result ?? o.AttendanceResult ?? 0), card: String(o.CardNo ?? '') };
}

export async function handleDahuaEvent(device, raw, prisma) {
  const events = parseDahuaEvents(raw);
  for (const ev of events) {
    if (!ev.user_id && !ev.card) continue;
    const key = ev.user_id || ev.card;
    const accred = await prisma.accreditation.findFirst({ where: { badge_code: key } });
    const resultOk = Number(ev.result) === 0;
    await prisma.accessLog.create({ data: {
      accreditation_id: accred?.id || 'unknown', person_name: accred?.person_name || ev.user_name || `Usuario ${key}`,
      badge_code: key, event_name: accred?.event_name || device.event_name || '', event_id: accred?.event_id || device.event_id || null,
      company: accred?.company || '', verified_by: `Dahua ${device.name}`, method: 'biometric', resource_type: 'person',
      zone: device.zone || '', result: accred && resultOk ? 'granted' : 'denied', denied_reason: !accred ? 'not_found' : (!resultOk ? 'blocked' : ''),
      access_level: accred?.access_level || '',
    } });
  }
}