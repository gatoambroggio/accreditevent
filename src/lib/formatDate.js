/**
 * Parse a server date string that may be missing the 'Z' UTC suffix.
 * The platform returns naive UTC timestamps like "2026-07-27T05:39:47.376000"
 * — without the 'Z', browsers interpret it as local time, causing a 3-hour offset.
 */
export function parseServerDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr);
  if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s + 'Z');
  }
  return new Date(s);
}

export function formatDateTime(dateStr) {
  const d = parseServerDate(dateStr);
  if (!d) return '';
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
}

export function formatTime(dateStr) {
  const d = parseServerDate(dateStr);
  if (!d) return '';
  return d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' });
}

export function formatTimeWithSeconds(dateStr) {
  const d = parseServerDate(dateStr);
  if (!d) return '';
  return d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}