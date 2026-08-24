// localClient.js — reemplazo de @/api/base44Client contra el servidor local
// air-gapped. Misma superficie: entities.list/filter/get/create/update/delete/
// subscribe, auth.me/login/etc, functions.invoke, integrations.Core.UploadFile,
// users.inviteUser, analytics.track, asServiceRole.
//
// Para usarlo: en src/main.jsx (o donde importes el SDK) cambiá
//   import { base44 } from '@/api/base44Client'
// por
//   import { base44 } from '@/api/localClient'
// (o bien apuntá @/api/base44Client a este archivo en el repo aparte).
//
// La URL base se toma de import.meta.env.VITE_API_URL o por defecto /api (servido
// por el mismo Nginx que sirve el frontend).

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

let _token = null;
let _refreshToken = null;
try {
  _token = localStorage.getItem('ae_access_token');
  _refreshToken = localStorage.getItem('ae_refresh_token');
} catch {}

function setToken(t) {
  _token = t;
  try { t ? localStorage.setItem('ae_access_token', t) : localStorage.removeItem('ae_access_token'); } catch {}
}
function setRefresh(t) {
  _refreshToken = t;
  try { t ? localStorage.setItem('ae_refresh_token', t) : localStorage.removeItem('ae_refresh_token'); } catch {}
}

// Mapa nombre de entidad (como en Base44) → path del API local.
const ENTITY_PATH = {
  Event: 'events',
  Person: 'people',
  Accreditation: 'accreditations',
  Vehicle: 'vehicles',
  AccessLog: 'access-logs',
  AccessLevel: 'access-levels',
  Company: 'companies',
  SystemSetting: 'settings',
  ParkingSector: 'parking-sectors',
  PdaStation: 'pda-stations',
  Biometric: 'biometrics',
  User: 'users',
  DahuaDevice: 'dahua-devices',
  DahuaCommand: 'dahua-commands',
  ZKTecoDevice: 'zkteco-devices',
  ZKTecoCommand: 'zkteco-commands',
  Document: 'documents',
  DocumentType: 'document-types',
  ProviderCompany: 'provider-companies',
  CustomField: 'custom-fields',
  EventCompanyApproval: 'event-company-approvals',
  ProviderRequest: 'provider-requests',
  RequirementItem: 'requirement-items',
  PendingOperator: 'pending-operators',
  AuditLog: 'audit-logs',
  Ticket: 'tickets',
  TicketType: 'ticket-types',
  TicketSale: 'ticket-sales',
  // Barras (POS)
  Bar: 'bars',
  BarProduct: 'bar-products',
  EventProduct: 'event-products',
  BarSale: 'bar-sales',
  BarOperator: 'bar-operators',
  BarTablet: 'bar-tablets',
  BarPosDevice: 'bar-pos-devices',
  BarCashMovement: 'bar-cash-movements',
};

async function http(path, { method = 'GET', body, headers, raw } = {}) {
  const h = { ...headers };
  if (_token) h.Authorization = `Bearer ${_token}`;
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: h,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // intenta refresh una vez
    if (_refreshToken && !path.includes('/auth/')) {
      const ok = await tryRefresh();
      if (ok) return http(path, { method, body, headers, raw });
    }
    setToken(null);
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (raw) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) { setToken(data.accessToken); setRefresh(data.refreshToken); return true; }
  } catch {}
  return false;
}

// --- CRUD por entidad ---
function makeEntity(name) {
  const path = `/${ENTITY_PATH[name] || name.toLowerCase() + 's'}`;
  return {
    async list(sort, limit = 50) {
      const q = new URLSearchParams();
      if (sort) q.set('sort', sort);
      if (limit) q.set('limit', String(limit));
      return http(`${path}?${q}`);
    },
    async filter(where, sort, limit = 50) {
      const q = new URLSearchParams();
      if (where) q.set('where', JSON.stringify(where));
      if (sort) q.set('sort', sort);
      if (limit) q.set('limit', String(limit));
      return http(`${path}?${q}`);
    },
    async get(id) { return http(`${path}/${id}`); },
    async create(data) { return http(path, { method: 'POST', body: data }); },
    async bulkCreate(arr) { return Promise.all(arr.map((d) => http(path, { method: 'POST', body: d }))); },
    async update(id, data) { return http(`${path}/${id}`, { method: 'PUT', body: data }); },
    async updateMany(where, update) {
      const op = update.$set ? { $set: update.$set } : update;
      return http(`${path}/update-many`, { method: 'POST', body: { where, ...op } });
    },
    async bulkUpdate(arr) { return Promise.all(arr.map((r) => http(`${path}/${r.id}`, { method: 'PUT', body: r }))); },
    async delete(id) { return http(`${path}/${id}`, { method: 'DELETE' }); },
    async deleteMany(where) { return http(`${path}/delete-many`, { method: 'POST', body: { where } }); },
    schema() { return {}; },
    subscribe(cb) { return subscribeRealtime(name, cb); },
  };
}

// --- Realtime por WebSocket local ---
let _ws = null;
const _wsSubs = new Map();
function ensureWs() {
  if (_ws || typeof WebSocket === 'undefined') return _ws;
  const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/ws`.replace('/api/ws', '/ws');
  _ws = new WebSocket(wsUrl);
  _ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const cbs = _wsSubs.get(msg.entity);
      if (cbs) cbs.forEach((cb) => cb({ type: msg.type, id: msg.id, data: msg.data }));
    } catch {}
  };
  return _ws;
}
function subscribeRealtime(entity, cb) {
  ensureWs();
  if (!_wsSubs.has(entity)) _wsSubs.set(entity, new Set());
  _wsSubs.get(entity).add(cb);
  const send = () => { if (_ws?.readyState === 1) _ws.send(JSON.stringify({ type: 'subscribe', entity })); else if (_ws) _ws.addEventListener('open', send, { once: true }); };
  send();
  return () => _wsSubs.get(entity)?.delete(cb);
}

// --- Auth ---
const auth = {
  async me() {
    const u = await http('/auth/me');
    return u;
  },
  async login({ email, password }) {
    const r = await http('/auth/login', { method: 'POST', body: { email, password } });
    if (r.accessToken) { setToken(r.accessToken); setRefresh(r.refreshToken); }
    return r;
  },
  async register(data) { return http('/auth/register', { method: 'POST', body: data }); },
  async verifyOtp({ email, otpCode }) {
    const r = await http('/auth/verify-otp', { method: 'POST', body: { email, otpCode } });
    if (r.accessToken) { setToken(r.accessToken); setRefresh(r.refreshToken); }
    return r;
  },
  async resendOtp(email) { return http('/auth/resend-otp', { method: 'POST', body: { email } }); },
  async resetPasswordRequest(email) { return http('/auth/reset-request', { method: 'POST', body: { email } }); },
  async resetPassword({ email, otpCode, newPassword }) {
    const r = await http('/auth/reset-confirm', { method: 'POST', body: { email, otpCode, newPassword } });
    if (r.accessToken) { setToken(r.accessToken); setRefresh(r.refreshToken); }
    return r;
  },
  async isAuthenticated() { try { await http('/auth/me'); return true; } catch { return false; } },
  async logout(redirectUrl) { await http('/auth/logout', { method: 'POST', body: { refreshToken: _refreshToken } }); setToken(null); setRefresh(null); if (redirectUrl) window.location.href = redirectUrl; },
  async updateMe(data) { return http('/auth/me', { method: 'PUT', body: data }); },
  async changePassword({ userId, newPassword }) { return http('/auth/change-password', { method: 'POST', body: { userId, newPassword } }); },
  async redirectToLogin(nextUrl) { window.location.href = `/login${nextUrl ? `?returnTo=${encodeURIComponent(nextUrl)}` : ''}`; },
  loginViaEmailPassword: (email, password) => auth.login({ email, password }),
  loginWithProvider() { throw new Error('login con provider no disponible en modo air-gapped.'); },
};

// --- Funciones backend (mismo contrato que base44.functions.invoke) ---
// Funciones de barra que usa la TABLET (sin token de plataforma) van a la ruta
// pública /bar-fn; el resto a /functions (requiere auth).
const BAR_FNS = new Set(['barOperatorLogin', 'barSale', 'barTabletHeartbeat']);
const functions = {
  async invoke(name, payload) {
    const p = BAR_FNS.has(name) ? `/bar-fn/${name}` : `/functions/${name}`;
    const res = await http(p, { method: 'POST', body: payload });
    // el servidor responde { data: ... } para emular el SDK
    return res;
  },
};

// --- Integraciones Core (UploadFile, InvokeLLM, GenerateImage, etc.) ---
// En air-gap UploadFile usa el disco local; las que requieren internet
// (InvokeLLM, GenerateImage, SendEmail) quedan como stubs informativos.
const integrations = {
  Core: {
    async UploadFile({ file }) {
      const fd = new FormData();
      fd.append('file', file);
      const r = await http('/files/upload', { method: 'POST', body: fd });
      return r; // { file_url }
    },
    async GenerateImage() { throw new Error('GenerateImage no disponible en modo air-gapped.'); },
    async InvokeLLM() { throw new Error('InvokeLLM no disponible en modo air-gapped (sin internet).'); },
    async SendEmail() { throw new Error('SendEmail no disponible en modo air-gapped (configurar SMTP local).'); },
    async TranscribeAudio() { throw new Error('TranscribeAudio no disponible en modo air-gapped.'); },
  },
};

// --- Users (invitaciones) ---
const users = {
  async inviteUser(email, role) { return http('/auth/invite', { method: 'POST', body: { email, role } }); },
};

// --- Analytics (no-op en local; log opcional) ---
const analytics = {
  track({ eventName, properties }) { /* noop en air-gap */ },
};

// asServiceRole: en el servidor local no hay service-role separado; las
// funciones backend que necesitan acceso total usan prisma directamente. El
// frontend que pide asServiceRole.entities cae al mismo proxy de entidades
// (el RLS aplica con el token del usuario actual).
const asServiceRole = {
  entities: new Proxy({}, { get: (_t, name) => makeEntity(name) }),
  integrations,
  connectors: { getConnection: async () => null },
};

export const base44 = {
  auth,
  functions,
  integrations,
  users,
  analytics,
  asServiceRole,
  entities: new Proxy({}, { get: (_t, name) => makeEntity(name) }),
};

export default base44;