# AccreditEvent — Servidor self-hosted (air-gapped, LAN) — COMPLETO

Reimplementación **100% local** de AccreditEvent sobre Node/Express/PostgreSQL,
sin dependencia de internet ni de la nube de Base44. Replica todas las
entidades, las 38 funciones backend, el motor de RLS, la autenticación JWT local
y las integraciones de hardware (Dahua/ZKTeco) por LAN.

## Stack
- Node.js 20+ · Express · PostgreSQL 16 · Prisma
- JWT + bcrypt + OTP local (sin Google/cloud)
- RLS middleware (mismo `$or`/`$and`/`user_condition` que los jsonc)
- Tesseract.js (patentes y OCR de seguros — sin internet)
- face-api.js en navegador (modelos servidos desde `/models`)
- WebSocket local (realtime, reemplaza suscripciones de Base44)
- Nginx (sirve React + reverse proxy `/api` + `/ws`)
- WebAuthn (`@simplewebauthn/server`) para credenciales biométricas

## Estructura
```
server/
  install.sh               # ← instalador one-click para Ubuntu
  package.json · .env.example · prisma/schema.prisma   # 30 entidades
  src/
    index.js · app.js      # entry + montaje de rutas
    config/env.js · db/prisma.js
    auth/                  # jwt, bcrypt, routes, middleware
    rls/                   # engine + middleware + policies (espejo jsonc)
    routes/                # events, persons, accreditations, access, pda, files,
                           # patentes, functions, settings, users, webhooks
    functions/             # ← las 38 funciones backend portadas
    shared/                # dahuaDigest (Digest Auth MD5), webauthn-utils
    realtime/ws.js         # WebSocket
    seed.js · migrate-from-cloud.js   # datos iniciales + migración
  nginx/accreditevent.conf
```

## Instalación one-click (Ubuntu Server)

```bash
# Copiá el repo a la máquina (air-gap o no) y:
cd server
sudo bash install.sh
```

El instalador prepara **todo**: Node 20, PostgreSQL 16, Nginx, Tesseract,
base de datos, `.env` con secretos aleatorios, migración Prisma, seed
(superadmin `admin@accreditevent.local` / `admin123`), build del frontend,
descarga de modelos face-api.js, servicio systemd y Nginx.

Al terminar:
- Panel en `http://<ip-lan>/`
- API en `http://<ip-lan>/api/health`
- Webhooks en `http://<ip-lan>/api/webhooks/dahua` y `/zkteco`

## Frontend: apuntar al servidor local

El frontend React **no se modifica** (mismas páginas, componentes, estilos).
Solo hay que hacer que el SDK del frontend apunte al servidor local. En el
repo self-hosted, reemplazá el contenido de `src/api/base44Client.js` por:

```js
export { base44 } from './localClient';
export { base44 as default } from './localClient';
```

(`src/api/localClient.js` ya está creado con la superficie completa:
entities CRUD + subscribe, auth.me/login/register/OTP/reset/updateMe,
users.inviteUser, integrations.Core.UploadFile, functions.invoke,
analytics.track, asServiceRole.)

Después el build del frontend (`VITE_API_URL=/api npm run build`) sirve contra
el servidor local vía Nginx.

## Migración de datos desde la nube (una vez, con internet)

Antes de desconectar la LAN, exportá los datos de la app de Base44 cloud a la
Postgres local (preserva IDs hex de 24 chars → QR/badge codes siguen válidos):

```bash
cd server
BASE44_API_URL=https://api.base44.com \
BASE44_ADMIN_TOKEN=<jwt-del-superadmin-cloud> \
npm run migrate:from-cloud
```

Migra en orden de dependencia: SystemSetting → Company → Event → User →
Person → Accreditation → Vehicle → Biometric → Document → hardware → logs.

## Las 38 funciones backend (todas en /api/functions/:name)

**Hardware:** dahuaSyncUsers, dahuaRemoteAction, dahuaWebhook, zktecoWebhook
**Visión:** readPatente (Tesseract), faceIdentify, faceVerify, checkFaceDuplicate, cleanupBiometrics, clearBiometrics
**Seguros:** validateInsurance (Tesseract + matching determinista), checkPersonDocuments, checkDocumentDuplicate, reviewDocument, notifyExpiringDocuments
**Documentos:** createDocument, deleteDocuments, uploadDocumentBase64
**Usuarios/operadores:** createUser, changeUserPassword, assignOperator, updateOperator, getCompanyOperators, getOperatorModules, updateCompanyOperatorModules, processPendingOperators
**Empresa/provider:** empresaSetup, providerSetup, saveProviderBiometric, getEmpresaEmployeeStatus, getCompanyEvents, getProductoraDocuments
**Utilidades:** getEventAccessData, deletePerson, cleanupDatabase, closeExpiredEvents
**WebAuthn:** webauthnRegister, webauthnVerify

Todas exponidas vía `POST /api/functions/:name` con el mismo contrato que
`base44.functions.invoke(name, payload)` → el frontend las llama sin cambios.

## RLS completo
`rls/policies/index.js` espeja las políticas de TODOS los jsonc. El motor
(`rls/engine.js`) traduce `$or`/`$and`/`user_condition`/`{{user.data.*}}`/`$in`
a filtros Prisma. Cada CRUD genérico aplica el filtro correcto por entidad y
operación (read/create/update/delete), igual que la plataforma.

## Hardware air-gapped
- **Dahua**: Digest Auth MD5 propio (`shared/dahuaDigest.js`) + CGI por IP LAN.
  Sync usuarios/rostros, open door, reboot, webhook de eventos.
- **ZKTeco**: protocolo iClock (GET options/handshake, GET polling comandos,
  POST accesos) con api_key local.
- Ambos crean `AccessLog` + `DahuaCommand`/`ZKTecoCommand` y actualizan `last_seen`.
- Sin puertos abiertos hacia internet — todo por la LAN.

## Notas air-gap
- El OTP de registro/reset se muestra en el **log del servidor** (no hay email).
- face-api.js corre en el navegador; pesos servidos desde `/models` (sin internet).
- `validateInsurance` usa Tesseract + matching determinista (reemplaza el LLM
  de visión de Base44 — sin internet, sin timeouts).
- `InvokeLLM`/`GenerateImage`/`SendEmail` de integrations.Core devuelven error
  explícito en air-gap (configurar SMTP local si se quiere email).

## Operación
```bash
systemctl status accreditevent     # estado
systemctl restart accreditevent     # reiniciar
journalctl -u accreditevent -f      # logs
sudo -u accreditevent psql accreditevent -c "..."   # DB
```

## Estado
- ✅ Schema: 30 entidades en Prisma
- ✅ RLS: 24 entidades con políticas completas
- ✅ Funciones: 38 portadas + dispatcher
- ✅ Auth: JWT local + OTP + roles + inviteUser + changePassword + updateMe
- ✅ Hardware: Dahua Digest + ZKTeco iClock + webhooks
- ✅ Realtime: WebSocket local
- ✅ Instalador: install.sh one-click
- ✅ Migración: migrate-from-cloud.js
- ✅ Frontend: localClient.js (superficie completa del SDK)

El sistema completo está listo para desplegar air-gapped en Ubuntu.