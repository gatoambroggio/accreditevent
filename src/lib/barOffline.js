// Cache + cola offline para el POS de barras (tablet). Usa localStorage (volumen
// moderado, una tablet por barra). Claves por barra para no mezclar datos.
// Las ventas encoladas se sincronizan con la función barSale al volver internet.

import { base44 } from '@/api/base44Client';

const CACHE_PREFIX = 'ae_bar_cache_';
const QUEUE_PREFIX = 'ae_bar_queue_';
const SESSION_PREFIX = 'ae_bar_session_';
const CRED_PREFIX = 'ae_bar_cred_';

export const isOnline = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);

// ---- SHA-256 hex (validación offline de credencial, sin guardar plaintext) ----
export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- Cache de catálogo / configuración de la barra ----
export function loadCache(barId) {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + barId) || 'null'); } catch { return null; }
}
export function saveCache(barId, data) {
  try { localStorage.setItem(CACHE_PREFIX + barId, JSON.stringify({ ...data, cachedAt: Date.now() })); } catch {}
}

// ---- Cola de ventas ----
export function loadQueue(barId) {
  try { return JSON.parse(localStorage.getItem(QUEUE_PREFIX + barId) || '[]'); } catch { return []; }
}
export function saveQueue(barId, arr) {
  try { localStorage.setItem(QUEUE_PREFIX + barId, JSON.stringify(arr)); } catch {}
}
export function enqueueSale(barId, sale) {
  const q = loadQueue(barId);
  q.push(sale);
  saveQueue(barId, q);
  return sale;
}
export function pendingCount(barId) {
  return loadQueue(barId).filter((s) => s.status === 'pending').length;
}
export function markSynced(barId, uuid, serverId) {
  const q = loadQueue(barId).map((s) => (s.client_uuid === uuid ? { ...s, status: 'synced', server_id: serverId } : s));
  saveQueue(barId, q);
}
export function markSyncError(barId, uuid, msg) {
  const q = loadQueue(barId).map((s) => (s.client_uuid === uuid ? { ...s, status: 'error', error: msg } : s));
  saveQueue(barId, q);
}

// ---- Sesión + credencial offline (por barra) ----
export function loadSession(barId) {
  try { return JSON.parse(localStorage.getItem(SESSION_PREFIX + barId) || 'null'); } catch { return null; }
}
export function saveSession(barId, session) {
  try { localStorage.setItem(SESSION_PREFIX + barId, JSON.stringify(session)); } catch {}
}
export function clearSession(barId) {
  try { localStorage.removeItem(SESSION_PREFIX + barId); } catch {}
}
export async function saveCred(barId, username, password) {
  const hash = await sha256Hex(password);
  try { localStorage.setItem(CRED_PREFIX + barId, JSON.stringify({ username: username.toLowerCase(), hash, savedAt: Date.now() })); } catch {}
}
export async function verifyCredOffline(barId, username, password) {
  try {
    const c = JSON.parse(localStorage.getItem(CRED_PREFIX + barId) || 'null');
    if (!c || c.username !== String(username).trim().toLowerCase()) return false;
    const hash = await sha256Hex(password);
    return hash === c.hash;
  } catch { return false; }
}

// ---- Sincronización: envía ventas pendientes a barSale una por una ----
export async function syncQueue(barId, onDone) {
  const q = loadQueue(barId);
  const pending = q.filter((s) => s.status === 'pending');
  if (pending.length === 0) { onDone?.({ synced: 0 }); return; }
  let synced = 0;
  for (const sale of pending) {
    try {
      const res = await base44.functions.invoke('barSale', {
        action: 'create',
        bar_id: barId,
        items: sale.items,
        payment_method: sale.payment_method,
        operator_id: sale.operator_id,
        operator_name: sale.operator_name,
        client_uuid: sale.client_uuid,
      });
      const data = res?.data || res;
      if (data && !data.error) {
        markSynced(barId, sale.client_uuid, data.sale_id);
        synced++;
      } else {
        markSyncError(barId, sale.client_uuid, (data && data.error) || 'error');
      }
    } catch (e) {
      markSyncError(barId, sale.client_uuid, e.message || 'error de red');
    }
  }
  onDone?.({ synced });
}

// ---- Padrón de retiradores (cache offline para lookup por DNI en el POS) ----
const PADRON_PREFIX = 'ae_bar_padron_';
export function loadPadron(barId) {
  try { return JSON.parse(localStorage.getItem(PADRON_PREFIX + barId) || 'null') || []; } catch { return []; }
}
export function savePadron(barId, arr) {
  try { localStorage.setItem(PADRON_PREFIX + barId, JSON.stringify(arr || [])); } catch {}
}