# AccreditEvent — Servidor local self-hosted (Fase 1 — slice vertical)

Servidor **air-gapped** Node/Express/PostgreSQL/Prisma que corre en la LAN de
Ubuntu. Fase 1: módulo de acreditación completo (Eventos + Personas +
Acreditaciones + validación de acceso por QR/facial/patentes) con el mismo
frontend React actual servido por Nginx desde el propio servidor.

## Stack
- Node.js 20+, Express
- PostgreSQL 16 + Prisma
- JWT + bcrypt + OTP local (sin Google en air-gap)
- RLS middleware (mismo $or/$and/user_condition que los jsonc)
- Tesseract OCR (patentes) — sin internet
- face-api.js en navegador (modelos servidos desde `/models`)
- WebSocket local (realtime, reemplaza suscripciones de Base44)
- Nginx (sirve React + reverse proxy /api + /ws)

## Estructura
```
server/
  package.json
  .env.example
  prisma/schema.prisma     # entidades del slice
  src/
    index.js               # entry
    app.js                 # express app + montaje de rutas
    config/env.js
    db/prisma.js
    auth/                  # jwt, bcrypt, routes, middleware
    rls/                   # engine + middleware + policies (espejo jsonc)
    routes/                # events, persons, accreditations, access, pda, files, patentes, functions, settings
    functions/             # getEventAccessData, readPatente, faceIdentify
    realtime/ws.js         # WebSocket
    seed.js                # superadmin + settings + niveles + sectores
  nginx/accreditevent.conf
```

## Puesta en marcha (Ubuntu)

```bash
# 1. Postgres local
sudo apt install postgresql-16
sudo -u postgres createuser accreditevent --pwprompt
sudo -u postgres createdb accreditevent -O accreditevent

# 2. Servidor
cd server
cp .env.example .env        # editar DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET
npm install
npx prisma migrate dev --name init
npm run seed                # crea superadmin admin@accreditevent.local / admin123
npm start                   # escucha :4000

# 3. Frontend (build estático)
cd ../  # raíz del repo
npm install
VITE_API_URL=/api npm run build
sudo mkdir -p /opt/accreditevent/frontend/dist
sudo cp -r dist/* /opt/accreditevent/frontend/dist/

# 4. Modelos face-api.js (descargar UNA vez con internet, luego offline)
#    Colocar pesos en server/public/models/: face_landmark_68_model-*.bin,
#    face_recognition_model-*.bin, tiny_face_detector_model-*.bin, ssd_mobilenetv1-*.bin

# 5. Nginx
sudo cp server/nginx/accreditevent.conf /etc/nginx/sites-available/accreditevent
sudo ln -s /etc/nginx/sites-available/accreditevent /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Apuntá el navegador a `http://<ip-lan>` y entrá con el superadmin del seed.

## API (slice)
- `POST /api/auth/login` · `POST /api/auth/register` · `POST /api/auth/verify-otp` · `GET /api/auth/me`
- `GET/POST/PUT/DELETE /api/events` · `/api/people` · `/api/accreditations` · `/api/vehicles`
- `POST /api/access/validate` — valida acceso (badge_code o plate) contra zona/sector/fase
- `GET /api/pda/event-data/:eventId` — datos del evento para caché offline
- `POST /api/pda/heartbeat` · `POST /api/pda/sync-logs`
- `POST /api/patentes/read` — Tesseract local
- `POST /api/functions/:name` — dispatcher (getEventAccessData, readPatente, faceIdentify)
- `POST /api/files/upload` — disco local
- `WS /ws` — realtime

## Frontend
El frontend no se reescribe. Solo se reemplaza el SDK: en `src/main.jsx` cambiá
`import { base44 } from '@/api/base44Client'` por `import { base44 } from '@/api/localClient'`
(este archivo ya está creado en `src/api/localClient.js`). Mismas páginas, componentes,
estilos y tema — apuntan al servidor local.

## Migración de datos del slice
Script pendiente (`src/migrate-from-cloud.js`): exporta eventos/personas/
acreditaciones/usuarios/access-levels/settings de Base44 cloud y los importa en
la Postgres local preservando IDs. Se arma en la siguiente iteración del slice.

## Fases siguientes (fuera de esta Fase 1)
- Extender el esquema Prisma a las 30 entidades (Dahua, ZKTeco, Documents,
  ProviderCompany, CustomField, AuditLog, etc.).
- Reimplementar las 38 funciones backend restantes (dahuaSyncUsers, dahuaWebhook,
  dahuaRemoteAction, zktecoWebhook, createUser, validateInsurance,
  cleanupBiometrics, deletePerson, etc.).
- Integrar hardware Dahua/ZKTeco por IP local (digest auth, JSON-RPC, webhooks).
- Migración de datos completa.
- SMTP local para OTP/notifications.

## Notas air-gap
- El OTP de registro/reset se **muestra en el log del servidor** (no hay email
  saliente). En producción, configurar SMTP local si se quiere notificación.
- face-api.js corre en el navegador; los pesos se sirven desde el propio
  servidor (`/models`), sin internet.
- InvokeLLM / GenerateImage / SendEmail de integrations.Core devuelven error
  explícito en air-gap (no hay internet). Tesseract reemplaza la lectura de
  patentes que antes usaba un LLM de visión.