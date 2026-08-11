// Almacenamiento local para modo offline de la PDA.
// Cachea personas acreditadas y vehículos por evento, y encola registros de acceso.

const DATA_PREFIX = 'offline_access_event_';
const PENDING_KEY = 'offline_access_pending_logs';
const VERIFIER_KEY = 'offline_access_verifier';

export function saveEventData(eventId, data) {
  try {
    localStorage.setItem(DATA_PREFIX + eventId, JSON.stringify({ ...data, cached_at: Date.now() }));
  } catch (e) {}
}

export function getEventData(eventId) {
  try {
    const raw = localStorage.getItem(DATA_PREFIX + eventId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCacheAgeMs(eventId) {
  const d = getEventData(eventId);
  return d ? Date.now() - d.cached_at : null;
}

export function queueAccessLog(log) {
  const pending = getPendingLogs();
  pending.push({ ...log, queued_at: new Date().toISOString() });
  writePendingLogs(pending);
  return pending.length;
}

export function getPendingLogs() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writePendingLogs(list) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list || []));
  } catch {}
}

export function clearPendingLogs() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

export function setCachedVerifier(name) {
  try {
    localStorage.setItem(VERIFIER_KEY, name || '');
  } catch {}
}

export function getCachedVerifier() {
  try {
    return localStorage.getItem(VERIFIER_KEY) || 'Sistema';
  } catch {
    return 'Sistema';
  }
}