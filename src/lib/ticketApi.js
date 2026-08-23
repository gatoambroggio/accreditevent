// Helper de API para la tienda pública de entradas (sin auth).
// En Base44 cloud usa la función pública /functions/ticketStore (anónima).
// Si la función no responde (p.ej. servidor self-hosted sin esa ruta), cae a
// las rutas Express /api/public/tickets del servidor Ubuntu.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

async function parseJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('La tienda de entradas no está disponible en este entorno.');
  }
  return res.json();
}

async function callFn(name, payload) {
  const res = await fetch(`/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await parseJson(res); msg = j.error || msg; } catch (e) { msg = e.message; }
    throw new Error(msg);
  }
  return parseJson(res);
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

async function tryFnThenHttp(fnName, fnPayload, httpPath, httpOpts) {
  try {
    return await callFn(fnName, fnPayload);
  } catch {
    return callHttp(httpPath, httpOpts);
  }
}

export const ticketApi = {
  listEvents: () => tryFnThenHttp('ticketStore', { action: 'list' }, '/public/tickets/events'),
  getEvent: (id) => tryFnThenHttp('ticketStore', { action: 'event', event_id: id }, `/public/tickets/events/${id}`),
  createOrder: (payload) => tryFnThenHttp(
    'ticketStore',
    { action: 'order', ...payload, app_base_url: window.location.origin },
    '/public/tickets/orders',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
  ),
  getTicket: (id) => tryFnThenHttp('ticketStore', { action: 'ticket', ticket_id: id }, `/public/tickets/${id}`),
};