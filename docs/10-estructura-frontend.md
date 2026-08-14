# 10 — Adaptación del frontend (capa de API intercambiable)

El frontend React actual es **el mismo código** de hoy. Solo se reemplaza la capa de datos: en vez del SDK de Base44 (`base44.entities.X`), un cliente HTTP a la API Express local. Todo el resto (componentes, páginas, Tailwind, shadcn, lógica de UI) se mantiene idéntico.

## Estrategia

Crear un cliente API que replique la **misma interfaz** del SDK de Base44 para que las páginas no cambien:

```js
// src/api/client.js
const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    method, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status, data: err });
  }
  return res.json();
}

// Factoría de entidades — misma forma que base44.entities.X
function makeEntity(name) {
  return {
    list: (sort, limit) => request('GET', `/${name}?sort=${sort||''}&limit=${limit||100}`).then(r => r.data),
    filter: (query, sort, limit) => request('POST', `/${name}/filter`, { query, sort, limit }).then(r => r.data),
    get: (id) => request('GET', `/${name}/${id}`).then(r => r.data),
    create: (data) => request('POST', `/${name}`, data).then(r => r.data),
    bulkCreate: (arr) => request('POST', `/${name}/bulk`, { items: arr }).then(r => r.data),
    update: (id, data) => request('PATCH', `/${name}/${id}`, data).then(r => r.data),
    bulkUpdate: (arr) => request('PATCH', `/${name}/bulk`, { items: arr }),
    updateMany: (query, update) => request('PATCH', `/${name}/update-many`, { query, update }),
    delete: (id) => request('DELETE', `/${name}/${id}`),
    deleteMany: (query) => request('POST', `/${name}/delete-many`, { query }),
    subscribe: (cb) => { /* websocket o polling; ver abajo */ return () => {}; },
  };
}

export const entities = new Proxy({}, {
  get: (_, name) => makeEntity(name.toString().toLowerCase()),
});

export const auth = {
  me: () => request('GET', '/auth/me').then(r => r.data),
  isAuthenticated: async () => !!localStorage.getItem('token'),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  logout: () => { localStorage.removeItem('token'); window.location.href = '/login'; },
  resetPasswordRequest: (email) => request('POST', '/auth/reset-password/request', { email }),
  resetPassword: (data) => request('POST', '/auth/reset-password', data),
  updateMe: (data) => request('PATCH', '/auth/me', data),
};

export const functions = {
  invoke: (name, payload) => request('POST', `/functions/${name}`, payload),
};

export const integrations = {
  Core: {
    UploadFile: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${BASE}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      return res.json(); // { file_url }
    },
    GenerateImage: (p) => functions.invoke('generateImage', p),
    // InvokeLLM → redirige a Ollama local vía /functions/llm
    InvokeLLM: (p) => functions.invoke('llm', p),
  },
};

export const users = { inviteUser: (email, role) => functions.invoke('createUser', { email, role }) };
export const analytics = { track: (e) => functions.invoke('track', e) };
```

## Reemplazo del import

En cada archivo que hoy hace:
```js
import { base44 } from '@/api/base44Client';
// ...
base44.entities.Person.list()
base44.auth.me()
base44.functions.invoke('validateInsurance', {...})
```

Reemplazar por:
```js
import { entities, auth, functions } from '@/api/client';
// ...
entities.Person.list()
auth.me()
functions.invoke('validateInsurance', {...})
```

Para minimizar el cambio, se puede reexportar desde `@/api/base44Client` con un shim:
```js
// src/api/base44Client.js (nuevo contenido — shim)
export { entities as base44_entities, auth, functions } from './client';
export const base44 = { entities, auth, functions, integrations, users, analytics };
```
Así **la mayoría de las páginas no necesitan cambios** — solo el shim cambia.

## Auth
Reemplazar el provider de auth de Base44 por un provider local que use el `auth` del cliente. Login → JWT en `localStorage`, redirect a `returnTo` o `/`. Mantener el flujo OTP de register si se quiere, o simplificar a registro directo + verificación por admin.

## Realtime (subscribe)
Base44 tiene realtime. En el self-hosted, reimplementar con **WebSocket** (ws) en Express:
```js
// servidor
const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', ws => { /* difundir eventos de entidad */ });
```
El `subscribe` del cliente abre un WebSocket y llama al callback con `{ type, data, id }`. Para el alcance del PRD (control de accesos), el realtime solo es necesario en **AccessMonitor**; las PDAs operan offline y no lo usan.

## Cambios mínimos por página
- Login/Register/Forgot/Reset → usar `auth.*` del cliente.
- Todas las páginas de CRUD → sin cambios (el shim cubre `base44.entities`).
- AccessQrStation → ya usa `offlineAccess.js` y `offlineValidation.js` locales; solo apuntar `syncFromServer` a `GET /access/data/:eventId`.
- InsuranceValidationModal → apunta a `functions.invoke('validateInsurance', ...)` → `/functions/validate-insurance`.
- FaceCapture → igual, el descriptor se calcula en el navegador.

## Build
```bash
VITE_API_URL=https://accredit.local/api npm run build
```
Output `dist/` se sirve por Nginx (ver `08-despliegue-ubuntu.md`).