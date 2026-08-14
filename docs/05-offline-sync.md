# 05 — Offline y sincronización

El control de accesos debe operar sin conexión al servidor. La PDA descarga el caché al iniciar y opera contra él; los intentos se encolan y se sincronizan al reconectar.

## Detección de online/offline (automática, sin botón)

```js
// hooks/useOnlineStatus.js
import { useState, useEffect } from 'react';
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Heartbeat al servidor cada 30s para detectar caída de LAN
    const hb = setInterval(async () => {
      try { await fetch('/api/health', { method: 'HEAD' }); setOnline(true); }
      catch { setOnline(false); }
    }, 30000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(hb); };
  }, []);
  return online;
}
```

## Caché local (IndexedDB)

Usar la librería `idb` (npm). Tres stores:

```js
// lib/offlineDb.js
import { openDB } from 'idb';
const db = await openDB('accredit-cache', 1, {
  upgrade(db) {
    db.createObjectStore('accreditations', { keyPath: 'badge_code' });
    db.createObjectStore('vehicles', { keyPath: 'plate' });
    db.createObjectStore('event', { keyPath: 'id' });
    db.createObjectStore('accessLogs', { keyPath: 'client_uuid' });
  },
});

export async function syncFromServer(eventId) {
  const data = await api.get(`/access/data/${eventId}`);
  const tx = db.transaction(['accreditations','vehicles','event'], 'readwrite');
  await tx.objectStore('accreditations').clear();
  await tx.objectStore('vehicles').clear();
  for (const a of data.accreditations) await tx.objectStore('accreditations').put(a);
  for (const v of data.vehicles) await tx.objectStore('vehicles').put(v);
  await tx.objectStore('event').put(data.event);
  await tx.done;
}
```

## Endpoint `/access/data/:eventId`

Payload único que la PDA descarga al iniciar:

```json
{
  "event": { "id","name","armado_start","armado_end","start_at","end_at","desarme_start","desarme_end","show_days","parking_capacities" },
  "accreditations": [ { "badge_code","person_name","access_level","event_phases","status","has_biometric","person_id" } ],
  "vehicles": [ { "plate","person_name","parking_sector","status","person_id" } ]
}
```
Servidor: query con RLS aplicada, paginada si el evento es grande (stream JSON).

## Verificación offline (sin round-trip)

```js
// lib/offlineAccess.js
export async function verifyOffline(badgeOrPlate, mode, station) {
  const store = mode === 'vehicle' ? 'vehicles' : 'accreditations';
  const key = mode === 'vehicle' ? 'plate' : 'badge_code';
  const norm = (s) => (s || '').toUpperCase().trim();
  const record = await db.get(store, norm(badgeOrPlate));

  if (!record) return { result: 'denied', denied_reason: 'not_found' };
  if (record.status === 'blocked' || record.status === 'revoked')
    return { result: 'denied', denied_reason: 'blocked' };

  // Validación de zona
  if (station.assigned_zone) {
    const zones = String(record.access_level || '').split(',').map(norm);
    if (!zones.includes(norm(station.assigned_zone)))
      return { result: 'denied', denied_reason: 'zone' };
  }

  // Validación de fase (fecha actual vs fases del evento)
  const event = await db.get('event', record.event_id);
  const phase = currentPhase(event); // armado|dia_N|desarme según fecha
  if (phase && !(record.event_phases || []).includes(phase))
    return { result: 'denied', denied_reason: 'phase' };

  return { result: 'granted', access_level: record.access_level, person_name: record.person_name };
}
```

## Registro + sincronización de AccessLog

Cada intento genera un **UUID en el cliente** (idempotencia):

```js
import { v4 as uuid } from 'uuid';
export async function logAccess(attempt) {
  const entry = { ...attempt, client_uuid: uuid(), created_date: new Date().toISOString() };
  await db.put('accessLogs', entry);
  if (navigator.onLine) await flushAccessLogs();
}

export async function flushAccessLogs() {
  const pending = await db.getAll('accessLogs');
  if (!pending.length) return;
  try {
    await api.post('/access/logs/sync', { logs: pending });
    const tx = db.transaction('accessLogs', 'readwrite');
    for (const l of pending) await tx.store.delete(l.client_uuid);
    await tx.done;
  } catch { /* reintenta en próximo heartbeat */ }
}
```

## Endpoint `/access/logs/sync` (servidor, idempotente)

```js
router.post('/access/logs/sync', authRequired, async (req, res) => {
  const logs = req.body.logs || [];
  for (const l of logs) {
    // upsert por client_uuid — si ya existe, no duplica
    await prisma.accessLog.upsert({
      where: { client_uuid: l.client_uuid },
      create: { ...l, created_date: new Date(l.created_date) },
      update: {}, // no sobrescribe si ya llegó
    });
  }
  res.json({ synced: logs.length });
});
```

## Caché de emergencia (EmergencyScan)
EmergencyScan también opera offline: descarga personas con datos médicos (`blood_type`, `allergies`, `emergency_contact_*`) en un store `people_emergency`. La identificación se hace por DNI exacto o por descriptor facial contra ese store (face-api.js en el navegador).

## Estado de caché en la UI (informativo, no accionable)
Mostrar contador de registros cacheados y pendientes de sync, **sin botones** — la sync es automática y oculta. Solo un indicador visual: "● Online · 1240 registros · 3 pendientes".