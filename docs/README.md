# AccreditEvent Self-Hosted — Documentación de implementación

Este conjunto de documentos describe cómo reimplementar **AccreditEvent** completo como un sistema 100% self-hosted sobre Ubuntu Server en una LAN air-gapped, sin dependencia de Base44 ni de internet.

## Stack
- **Backend:** Node.js 20+ / Express / PostgreSQL 16 / Prisma ORM
- **Auth:** JWT (jsonwebtoken) + bcrypt, local, sin proveedores externos
- **OCR:** tesseract.js (Node) para validación de seguros
- **Facial:** face-api.js ejecutándose en el navegador/PDA (modelos locales)
- **Frontend:** React + Vite + Tailwind + shadcn/ui (el mismo de hoy, con capa de API intercambiable)
- **Servidor:** Ubuntu Server + Nginx + PM2 + PostgreSQL local

## Índice de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [arquitectura.md](./01-arquitectura.md) | Topología LAN, componentes, puertos, diagrama de red |
| 02 | [base-de-datos.md](./02-base-de-datos.md) | Esquema Prisma completo (PostgreSQL) — todas las entidades |
| 03 | [api-endpoints.md](./03-api-endpoints.md) | Rutas Express que replican los ~30 backend functions actuales |
| 04 | [rls-middleware.md](./04-rls-middleware.md) | Reglas de control de acceso por rol/empresa (equivalente RLS) |
| 05 | [offline-sync.md](./05-offline-sync.md) | Caché IndexedDB, detección online/offline, sincronización de AccessLog |
| 06 | [reconocimiento-facial.md](./06-reconocimiento-facial.md) | face-api.js, captura de descriptor, matching, chequeo de duplicado |
| 07 | [validacion-seguros.md](./07-validacion-seguros.md) | OCR local + matching determinista de cláusulas/CUIT/DNI (porte de validateInsurance) |
| 08 | [despliegue-ubuntu.md](./08-despliegue-ubuntu.md) | Instalación paso a paso: Nginx, PM2, Postgres, HTTPS autofirmado, backups, impresoras |
| 09 | [matriz-modulos-roles.md](./09-matriz-modulos-roles.md) | Matriz módulo → roles permitidos (puerta a puerta) |
| 10 | [estructura-frontend.md](./10-estructura-frontend.md) | Cómo adaptar el frontend React actual para consumir la API Express local |

## Cómo usar esta documentación

1. Empezá por `01-arquitectura.md` para entender la topología y los puertos.
2. Crear el proyecto Node/Express e instalar dependencias según `08-despliegue-ubuntu.md`.
3. Definir el esquema con `02-base-de-datos.md` y correr `prisma migrate`.
4. Implementar los endpoints de `03-api-endpoints.md` con el middleware de `04-rls-middleware.md`.
5. Portear la lógica crítica: `06-reconocimiento-facial.md` y `07-validacion-seguros.md`.
6. Implementar el offline en el frontend con `05-offline-sync.md`.
7. Migrar el frontend React actual reemplazando la capa `@/api/base44Client` por un cliente HTTP a la API Express (ver `10-estructura-frontend.md`).

## Notas
- El sistema actual (Base44) sirve como **referencia funcional exacta**: cada backend function, entidad y flujo del PRD tiene su equivalente documentado acá.
- Todo lo que hoy hace la plataforma (auth, DB, OCR, facial, realtime) se reimplementa con librerías open-source locales.
- El frontend es el **mismo código React** que ya existe; solo cambia la capa de datos.