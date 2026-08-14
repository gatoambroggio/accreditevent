# 03 — API endpoints (Express)

Cada ruta mapea a un backend function actual de Base44. JWT obligatorio salvo `/auth/login` y webhooks. El middleware de RLS (ver `04-rls-middleware.md`) filtra automáticamente por `req.user.role` y `req.user.company`.

## Auth
| Método | Ruta | Equivalente | Descripción |
|--------|------|-------------|-------------|
| POST | `/auth/login` | loginViaEmailPassword | email+password → JWT |
| GET | `/auth/me` | base44.auth.me | usuario actual |
| PATCH | `/auth/me` | base44.auth.updateMe | actualizar datos propios |
| POST | `/auth/reset-password/request` | resetPasswordRequest | email → token |
| POST | `/auth/reset-password` | resetPassword | token+newPassword |
| POST | `/auth/invite` | base44.users.inviteUser | crea PendingOperator |
| POST | `/auth/users` | createUser | admin crea usuario con rol/empresa/eventos |
| PATCH | `/auth/users/:id` | updateOperator | editar rol/eventos/módulos/bloqueo |
| POST | `/auth/users/:id/password` | changeUserPassword | cambiar contraseña |
| POST | `/auth/operators/assign` | assignOperator | productora asigna operador existente |
| GET | `/auth/companies/:name/operators` | getCompanyOperators | operadores de una productora |
| PATCH | `/auth/companies/:name/modules` | updateCompanyOperatorModules | módulos permitidos de operadores |

## Eventos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/events` | listar/crear (RLS por company) |
| GET/PATCH/DELETE | `/events/:id` | detalle/actualizar/borrar |
| GET | `/events/:id/access-data` | getEventAccessData — datos para caché PDA (acreditaciones+vehículos+config) |
| GET | `/companies/:name/events` | getCompanyEvents |
| POST | `/events/:id/company-approvals` | crear EventCompanyApproval |
| PATCH | `/events/:id/company-approvals/:cid` | aprobar/rechazar proveedor |

## Personas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/people` | listar/crear (DNI único global) |
| GET/PATCH/DELETE | `/people/:id` | CRUD |
| POST | `/people/check-document` | checkDocumentDuplicate |
| POST | `/people/check-documents` | checkPersonDocuments — estado de docs requeridos |
| POST | `/people/:id/face-duplicate` | checkFaceDuplicate (paginado, sin límite 500) |
| DELETE | `/people/:id` | deletePerson — borrado en cascada (acreditaciones, biometría, vehículos, documentos) |
| POST | `/people/bulk` | bulkCreate (import Excel) |

## Acreditaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/accreditations` | listar/crear (valida docs+seguro+evento) |
| GET/PATCH/DELETE | `/accreditations/:id` | CRUD |
| POST | `/accreditations/bulk` | bulkCreate + bulkUpdate |

## Biometría facial
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/biometrics` | saveProviderBiometric — guarda descriptor+foto |
| POST | `/biometrics/identify` | faceIdentify — matching euclidiano contra evento |
| POST | `/biometrics/verify` | faceVerify — 1:1 contra acreditación |
| DELETE | `/biometrics/person/:personId` | clearBiometrics |
| POST | `/biometrics/cleanup` | cleanupBiometrics (paginado) |

## Documentos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/documents` | listar/crear |
| GET/PATCH/DELETE | `/documents/:id` | CRUD |
| POST | `/documents/upload-base64` | uploadDocumentBase64 |
| POST | `/documents/:id/review` | reviewDocument — aprobar/rechazar |
| DELETE | `/documents/bulk` | deleteDocuments |
| POST | `/documents/:id/validate-insurance` | validateInsurance — OCR + cláusulas (ver doc 07) |
| GET | `/documents/productora` | getProductoraDocuments |
| POST | `/documents` | createDocument (wrapper) |

## Vehículos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/vehicles` | listar/crear |
| GET/PATCH/DELETE | `/vehicles/:id` | CRUD |

## Accesos (PDA)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/access/data/:eventId` | getEventAccessData — payload completo para caché offline |
| POST | `/access/verify` | verificación online (opcional, normalmente offline) |
| POST | `/access/logs/sync` | sincronización batch de AccessLog (idempotente por client_uuid) |
| GET | `/access/logs` | AccessMonitor — listado en tiempo real (RLS) |

## Estaciones PDA
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/pda-stations` | listar/crear |
| PATCH | `/pda-stations/:id` | heartbeat (last_seen, battery, pending_sync) |
| POST | `/pda-stations/heartbeat` | reportar estado |
| PATCH | `/pda-stations/:id/pin` | cambiar admin_pin (requiere superadmin) |

## Empresas / Proveedores
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/companies` | CRUD (Company) |
| GET/POST | `/provider-companies` | CRUD (ProviderCompany) |
| POST | `/providers/setup` | providerSetup — alta proveedor + bios + acreditación |
| POST | `/empresa/setup` | empresaSetup — alta empresa + empleados |
| GET | `/empresa/:id/employee-status` | getEmpresaEmployeeStatus |

## Solicitudes de logística
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/provider-requests` | listar/crear |
| PATCH | `/provider-requests/:id` | revisar ítems |
| GET/POST | `/requirement-items` | catálogo de ítems |

## Configuración y catálogos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/PATCH | `/settings` | SystemSetting (singular) |
| GET/POST | `/document-types` | CRUD |
| GET/POST | `/parking-sectors` | CRUD |
| GET/POST | `/access-levels` | CRUD |
| GET/POST | `/custom-fields` | CRUD |

## ZKTeco
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/zkteco/webhook` | zktecoWebhook — endpoint iClock (sin auth, IP allowlist) |
| GET/POST | `/zkteco/devices` | CRUD |
| POST | `/zkteco/commands` | crear comando |
| PATCH | `/zkteco/commands/:id` | actualizar estado |

## Mantenimiento
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/maintenance/cleanup-database` | cleanupDatabase |
| POST | `/maintenance/close-expired-events` | closeExpiredEvents |
| POST | `/maintenance/notify-expiring-documents` | notifyExpiringDocuments |

## Regiones del frontend (rutas React)
El frontend mantiene las mismas rutas que hoy (`/`, `/events`, `/people`, `/control-qr`, etc.). Solo cambia la capa de datos: en vez de `base44.entities.X.list()` llama a `api.get('/people')`.

## Formato de respuesta estándar
```json
{ "data": [...], "total": 42, "has_more": false }
```
Errores:
```json
{ "error": "mensaje", "code": "NOT_FOUND" }
``