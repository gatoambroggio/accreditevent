// Helper de API para la tienda pública de entradas (sin auth).
// Las rutas públicas viven en /api/public/tickets y /api/webhooks/mercadopago.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const ticketApi = {
  listEvents: () => apiGet('/public/tickets/events'),
  getEvent: (id) => apiGet(`/public/tickets/events/${id}`),
  createOrder: (payload) => apiPost('/public/tickets/orders', payload),
  getTicket: (id) => apiGet(`/public/tickets/${id}`),
};