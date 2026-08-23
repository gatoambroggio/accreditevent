// Helper de API para la tienda pública de entradas (sin auth).
// Las rutas públicas viven en /api/public/tickets y /api/webhooks/mercadopago.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

async function parseJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // El backend devolvió HTML (típicamente el index del SPA en un 404): la
    // ruta pública de entradas no existe en este entorno. Degradamos con un
    // error limpio en vez de un "Unexpected token '<'" al parsear.
    throw new Error('La tienda de entradas no está disponible en este entorno.');
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await parseJson(res); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return parseJson(res);
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await parseJson(res); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return parseJson(res);
}

export const ticketApi = {
  listEvents: () => apiGet('/public/tickets/events'),
  getEvent: (id) => apiGet(`/public/tickets/events/${id}`),
  createOrder: (payload) => apiPost('/public/tickets/orders', payload),
  getTicket: (id) => apiGet(`/public/tickets/${id}`),
};