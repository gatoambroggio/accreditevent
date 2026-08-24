// Helper de API para la tienda pública de entradas (sin auth).
// En Base44 cloud usa base44.functions.invoke('ticketStore') (anónima).
// Si la invocación falla (p.ej. servidor self-hosted sin esa función), cae a
// las rutas Express /api/public/tickets del servidor Ubuntu.

import { base44 } from '@/api/base44Client';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

async function parseJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('La tienda de entradas no está disponible en este entorno.');
  }
  return res.json();
}

async function callHttp(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await parseJson(res); msg = j.error || msg; } catch (e) { msg = e.message; }
    throw new Error(msg);
  }
  return parseJson(res);
}

async function tryInvokeThenHttp(fnPayload, httpPath, httpOpts) {
  try {
    const res = await base44.functions.invoke('ticketStore', fnPayload);
    return res.data ?? res;
  } catch {
    return callHttp(httpPath, httpOpts);
  }
}

export const ticketApi = {
  listEvents: () => tryInvokeThenHttp({ action: 'list' }, '/public/tickets/events'),
  getEvent: (id) => tryInvokeThenHttp({ action: 'event', event_id: id }, `/public/tickets/events/${id}`),
  createOrder: (payload) => tryInvokeThenHttp(
    { action: 'order', ...payload, app_base_url: window.location.origin },
    '/public/tickets/orders',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  ),
  getTicket: (id) => tryInvokeThenHttp({ action: 'ticket', ticket_id: id }, `/public/tickets/${id}`),
};