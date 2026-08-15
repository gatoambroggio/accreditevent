import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Webhook que recibe los eventos push de las terminales Dahua (face access control).
// La terminal se configura con "Event Center Server" / HTTP Push apuntando a esta
// URL + ?key=API_KEY&sn=SERIAL. Cuando alguien pasa, la terminal envía un POST JSON
// con el evento de acceso (Code=AccessControl / FaceRecognition / Attendance).
// Nosotros lo registramos como AccessLog, igual que el webhook de ZKTeco.
//
// Formatos soportados (firmware-dependientes):
//   A) JSON: { "method":"notify.event", "params":{ "Code":"AccessControl", "Data":{ "UserID":"1", "UserName":"...", "Result":0 } } }
//   B) texto clave=valor (streaming eventManager): líneas con Code=... y data={...}
//   C) multipart con snapshot: campo "data" JSON + imagen (se ignora la imagen)

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const params = url.searchParams;
    const sn = params.get('sn') || '';
    const apiKey = params.get('key') || '';

    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

    // Handshake simple: GET sin body responde OK (algunas terminales verifican reachability)
    if (req.method === 'GET') return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });

    if (!sn) return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });

    const devices = await base44.asServiceRole.entities.DahuaDevice.filter({ serial_number: sn });
    const device = devices[0];
    if (!device) return new Response('ERROR: Device not registered', { status: 403, headers: { 'Content-Type': 'text/plain' } });
    if (device.api_key && apiKey !== device.api_key) return new Response('ERROR: Auth failed', { status: 403, headers: { 'Content-Type': 'text/plain' } });

    // Actualizar last_seen (heartbeat)
    base44.asServiceRole.entities.DahuaDevice.update(device.id, { last_seen: new Date().toISOString(), status: 'active' }).catch(() => {});

    // Leer body
    let raw = '';
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      raw = fd.get('data') || fd.get('event') || '';
      if (raw && typeof raw !== 'string') raw = await raw.text();
    } else {
      raw = await req.text();
    }

    const events = parseEvents(raw);
    for (const ev of events) {
      await logAccess(base44, device, ev);
    }

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Extrae eventos de acceso del body (formato A o B).
function parseEvents(raw) {
  const events = [];
  if (!raw) return events;
  raw = raw.trim();

  // Intento JSON (puede ser un solo evento o un array)
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const p of arr) {
        const params = p.params || p;
        const code = params.Code || params.code || '';
        const data = params.Data || params.data || {};
        if (data && typeof data === 'object') {
          events.push({
            code,
            user_id: String(data.UserID ?? data.userID ?? data.user_id ?? ''),
            user_name: String(data.UserName ?? data.userName ?? data.user_name ?? ''),
            result: data.Result ?? data.AttendanceResult ?? data.result ?? 0,
            card: String(data.CardNo ?? data.cardNo ?? ''),
          });
        }
      }
      return events;
    } catch {
      // cae al formato B
    }
  }

  // Formato B: líneas key=valor, posiblemente con data={...}
  const lines = raw.split('\n');
  let current = {};
  for (const line of lines) {
    const m = line.match(/^\s*(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === 'Code' || key === 'code') {
      if (current.code) events.push(normalizeKV(current));
      current = { code: val };
    } else if (key === 'data' && val.startsWith('{')) {
      try { Object.assign(current, JSON.parse(val)); } catch {}
    } else {
      current[key] = val;
    }
  }
  if (current.code || current.UserID) events.push(normalizeKV(current));
  return events;
}

function normalizeKV(o) {
  return {
    code: o.code || o.Code || '',
    user_id: String(o.UserID ?? o.userID ?? ''),
    user_name: String(o.UserName ?? o.userName ?? ''),
    result: Number(o.Result ?? o.AttendanceResult ?? 0),
    card: String(o.CardNo ?? o.cardNo ?? ''),
  };
}

async function logAccess(base44, device, ev) {
  if (!ev.user_id && !ev.card) return;
  const key = ev.user_id || ev.card;

  // Match por badge_code (UserID) o por card (CardNo)
  const accreds = await base44.asServiceRole.entities.Accreditation.filter({ badge_code: key }, '-created_date', 1);
  const accred = accreds[0];

  const resultOk = Number(ev.result) === 0;

  await base44.asServiceRole.entities.AccessLog.create({
    accreditation_id: accred?.id || '',
    person_name: accred?.person_name || ev.user_name || `Usuario ${key}`,
    badge_code: key,
    event_name: accred?.event_name || device.event_name || '',
    event_id: accred?.event_id || device.event_id || '',
    company: accred?.company || '',
    verified_by: `Dahua ${device.name}`,
    method: 'biometric',
    resource_type: 'person',
    zone: device.zone || '',
    result: accred && resultOk ? 'granted' : 'denied',
    denied_reason: !accred ? 'not_found' : (!resultOk ? 'blocked' : ''),
    access_level: accred?.access_level || '',
  });
}