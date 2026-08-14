# 09 — Matriz módulos → roles

Replica el control de visibilidad de menú/rutas. En el frontend, un usuario con `allowed_paths` no vacío **solo ve** esos módulos; si está vacío, se aplican los defaults por rol de `SystemSetting.role_access`.

## Reglas
- `superadmin` / `admin` / `coordinator`: ven todo.
- `productora`: ve su empresa + módulos operativos (no admin globales).
- `operador`: ve solo los módulos que la productora habilitó en `Company.operator_allowed_paths` o que el admin seteó en `User.allowed_paths`.
- `pda`: **shell restringido** — solo Control de accesos, PDA ID y Escaneo de emergencia. Sin sidebar administrativo.
- `provider` / `empresa`: portal proveedor/empresa, no backend administrativo.

## Matriz (✓ = permitido)

| Módulo (ruta) | superadmin | admin | coordinator | productora | operador | control | pda | provider | empresa |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `/` Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/events` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/people` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `/personas-autonomas` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/accreditations` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/personal-acreditado` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/access-levels` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/documents` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `/vehicles` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `/parking-sectors` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/parking-capacities` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/provider-companies` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/companies` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/users` | ✓ | ✓ | — | ✓* | — | — | — | — | — |
| `/audit` | ✓ | ✓ | — | — | — | — | — | — | — |
| `/zkteco-devices` | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| `/pda-stations` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/custom-fields` | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| `/apariencia` | ✓ | ✓ | — | — | — | — | — | — | — |
| `/settings` | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| `/reports` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/messages` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/notifications` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| `/access-control` (hub) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/access-monitor` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| `/control-qr` (PDA persona) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/control-vehicular` (PDA veh) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/control-manual` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/pda-id` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/emergency-scan` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `/accreditation-facial` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/dni-scan` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `/portal` (proveedor) | — | — | — | — | — | — | — | ✓ | — |
| `/empresa-portal` | — | — | — | — | — | — | — | — | ✓ |

> `*` productora ve solo usuarios de su empresa (vía `getCompanyOperators`).

## Implementación en el frontend

```js
// lib/modules.js — lista central (igual que hoy)
export const MODULES = [
  { path: '/events', label: 'Eventos', roles: ['superadmin','admin','coordinator','productora'] },
  { path: '/control-qr', label: 'Control QR', roles: ['superadmin','admin','coordinator','productora','operador','control','pda'] },
  // ... ver archivo src/lib/modules.js actual como referencia
];

// lib/hasAccess.js
export function hasModuleAccess(user, mod) {
  if (['superadmin','admin','coordinator'].includes(user.role)) return true;
  if (user.allowed_paths?.length) return user.allowed_paths.includes(mod.path);
  const rule = mod.roles || [];
  return rule.includes(user.role);
}
```

El `AppLayout` filtra el sidebar con `hasModuleAccess`, igual que hoy. El shell PDA para rol `pda` oculta el sidebar administrativo y muestra solo los 3 módulos asignados.