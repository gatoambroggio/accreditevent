# 01 — Arquitectura

## Topología LAN air-gapped

```
┌─────────────────────────────────────────────────────────────┐
│                    LAN (switch cableado)                     │
│                                                              │
│   ┌──────────────────────┐         ┌──────────────────────┐ │
│   │  Servidor Ubuntu     │         │  PDAs / Tablets      │ │
│   │  (única fuente de    │  HTTPS  │  (Android / Zebra)   │ │
│   │  verdad)             │◄───────►│  navegador Chrome   │ │
│   │                      │         │  + face-api.js        │ │
│   │  - Node/Express API  │         │  + IndexedDB (caché) │ │
│   │  - PostgreSQL 16     │         │  + cámara / scanner  │ │
│   │  - Nginx (proxy+UI)  │         └──────────────────────┘ │
│   │  - PM2               │                                  │
│   │  - uploads/ (files)   │         ┌──────────────────────┐ │
│   └──────────────────────┘         │  Terminales ZKTeco   │ │
│              │                      │  (iClock, webhook)   │ │
│              │ pg_dump cron          └──────────────────────┘ │
│              ▼                                                 │
│   ┌──────────────────────┐                                   │
│   │  NAS / disco backup   │                                   │
│   └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
        │
        └── NO hay salida a internet (air-gap)
```

## Componentes

### Servidor Ubuntu (única fuente de verdad)
- **Nginx** (puerto 80/443): reverse proxy a la API Express + sirve los estáticos del build del frontend. Termina HTTPS (cert autofirmado en air-gap).
- **Node/Express API** (puerto 4000 interno, solo accesible vía Nginx): toda la lógica de negocio, auth JWT, validación de seguros (OCR), matching facial, CRUD de entidades.
- **PostgreSQL 16** (puerto 5432, solo localhost): base de datos relacional. Esquema gestionado por Prisma.
- **PM2**: gestor de procesos, reinicio automático, logs.
- **uploads/**: filesystem local para PDF/imágenes de seguros y fotos faciales. Servido por Nginx o Express static.
- **Cron pg_dump**: backup nocturno a disco local o NAS de la LAN.

### PDAs / Tablets (clientes con caché offline)
- Navegador Chrome (modo kiosk recomendado).
- **IndexedDB**: caché local de acreditaciones activas, vehículos y datos del evento, descargado al iniciar sesión.
- **face-api.js**: modelos descargados al dispositivo para captura de descriptor facial (sin llamadas externas).
- **Cámara web** (html5-qrcode) o **scanner Zebra** (keyboard wedge) como modos de entrada alternativos.
- **Cola de AccessLog** en IndexedDB: intentos de acceso se registran offline y se sincronizan al reconectar.

### Terminales ZKTeco (opcionales)
- Dispositivos iClock que hacen biometría por hardware.
- Se comunican con el servidor vía webhook iClock (puerto 4000) — equivalente al `zktecoWebhook` actual.

## Puertos

| Componente | Puerto | Accesible desde | Notas |
|------------|--------|-----------------|-------|
| Nginx HTTPS | 443 | Toda la LAN | Entrada única de PDAs |
| Express API | 4000 | Solo Nginx (localhost) | No exponer directo |
| PostgreSQL | 5432 | Solo localhost | Nunca a la LAN |
| ZKTeco webhook | 4000 | Terminales ZKTeco | Mismo proceso Express |

## Flujo de un acceso (día del evento)

1. La PDA inicia sesión (login local JWT) → descarga caché del evento asignado desde la API.
2. Operador escanea QR de credencial o patente.
3. La validación se ejecuta **contra IndexedDB** (zona, fase actual según fecha del evento, estado de acreditación). No hay round-trip al servidor.
4. Se registra el intento en la cola local de AccessLog (UUID por intento).
5. Si hay conexión LAN, la cola se envía en batch a `/access-logs/sync` (deduplicación por UUID). Si no, queda pendiente hasta reconectar.
6. El servidor consolida todos los AccessLog y los expone en AccessMonitor en tiempo real.

## Resiliencia

- **Corte de red:** las PDAs siguen validando contra caché. Cero impacto en la puerta.
- **Caída del servidor:** las PDAs operan hasta agotar caché. Al volver el servidor, resincronizan. No hay datos perdidos (UUID idempotente).
- **Caída de una PDA:** su cola local persiste en IndexedDB; al reiniciar retoma la sincronización.