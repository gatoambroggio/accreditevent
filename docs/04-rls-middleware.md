# 04 — Middleware de control de acceso (equivalente RLS)

Base44 aplica Row-Level Security en la DB. En el sistema self-hosted, el control se hace en **middleware de Express** que filtra cada query de Prisma según `req.user.role` y `req.user.company`. Cada regla RLS actual se traduce a un filtro `WHERE` construido dinámicamente.

## Middleware base

```js
// middleware/auth.js
const jwt = require('jsonwebtoken');

async function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.blocked) return res.status(401).json({ error: 'Usuario inválido' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}
```

## Builder de filtros por rol

```js
// middleware/rls.js
// Devuelve un objeto WHERE de Prisma según el rol y la entidad.
function buildFilter(entity, user, extra = {}) {
  const role = user.role;
  const company = user.company || '';
  const assigned = user.assigned_event_ids || [];

  // Superadmin / admin / coordinator: sin filtro
  if (['superadmin', 'admin', 'coordinator'].includes(role)) {
    return { ...extra };
  }

  switch (entity) {
    case 'Event':
    case 'AccessLog':
    case 'Accreditation':
      if (role === 'productora' || role === 'operador' || role === 'pda')
        return { company, ...extra };
      return { event_id: { in: assigned }, ...extra };

    case 'Person':
      if (role === 'productora') return { productora: company, ...extra };
      if (role === 'empresa') return { company, ...extra };
      return { OR: [{ event_id: { in: assigned } }, { email: user.email }], ...extra };

    case 'Vehicle':
    case 'Document':
    case 'Biometric':
      if (role === 'productora' || role === 'empresa')
        return { company, ...extra };
      return { OR: [{ event_id: { in: assigned } }, { created_by_id: user.id }], ...extra };

    case 'PdaStation':
      if (role === 'pda') return { company, ...extra };
      return { OR: [{ event_id: { in: assigned } }, { assigned_event_id: { in: assigned } }], ...extra };

    case 'ProviderCompany':
      if (role === 'empresa') return { name: company, ...extra };
      return { ...extra }; // productora/admin leen todo

    case 'Company':
      // productora lee todas; empresa solo la suya (filtrar en handler)
      return { ...extra };

    case 'PendingOperator':
      if (role === 'productora') return { company, status: 'pending', ...extra };
      return { status: 'pending', ...extra };

    default:
      return { ...extra };
  }
}

// Permisos de escritura por rol
const WRITE_RULES = {
  Event:        { create: ['productora','superadmin','admin','coordinator'], update: ['productora','superadmin','admin','coordinator'], delete: ['superadmin','admin','coordinator'] },
  Person:       { create: ['productora','superadmin','admin','coordinator','provider','empresa'], update: ['productora','superadmin','admin','coordinator','empresa'], delete: ['superadmin','admin','coordinator','productora'] },
  Accreditation:{ create: ['productora','superadmin','admin','coordinator'], update: ['productora','superadmin','admin','coordinator'], delete: ['superadmin','admin','coordinator'] },
  Vehicle:      { create: ['productora','superadmin','admin','coordinator','empresa','provider'], update: ['productora','superadmin','admin','coordinator','empresa'], delete: ['superadmin','admin','coordinator','productora'] },
  Document:     { create: ['productora','superadmin','admin','coordinator','empresa','provider'], update: ['productora','superadmin','admin','coordinator','empresa'], delete: ['superadmin','admin','coordinator','productora'] },
  Biometric:    { create: ['productora','superadmin','admin','coordinator','empresa','provider'], update: ['productora','superadmin','admin','coordinator','empresa'], delete: ['superadmin','admin','coordinator','productora'] },
  AccessLog:    { create: ['productora','superadmin','admin','coordinator','control','pda'], update: ['superadmin','admin','coordinator'], delete: ['superadmin','admin','coordinator'] },
  Company:      { create: ['superadmin','admin'], update: ['superadmin','admin'], delete: ['superadmin','admin'] },
  ProviderCompany:{ create: ['productora','superadmin','admin','coordinator'], update: ['productora','superadmin','admin','coordinator'], delete: ['productora','superadmin','admin','coordinator'] },
  PendingOperator:{ create: ['productora','superadmin','admin'], update: ['superadmin','admin'], delete: ['superadmin','admin'] },
};

function canWrite(entity, op, role) {
  return (WRITE_RULES[entity]?.[op] || []).includes(role);
}

module.exports = { buildFilter, canWrite, authRequired };
```

## Uso en un controlador

```js
router.get('/people', authRequired, async (req, res) => {
  const where = buildFilter('Person', req.user, { status: 'active' });
  const items = await prisma.person.findMany({ where, orderBy: { created_date: 'desc' }, take: 500 });
  res.json({ data: items });
});

router.post('/accreditations', authRequired, async (req, res) => {
  if (!canWrite('Accreditation', 'create', req.user.role))
    return res.status(403).json({ error: 'Sin permiso' });
  // ... crear
});
```

## Casing de company
Known issue actual: mismatch de case entre `User.company` y `Company.name`. En el self-hosted, **normalizar siempre a lowercase** al asignar `company` en el alta de usuario y comparar con `LOWER()`. Prisma: usar un campo derivado `company_lower` o filtrar con `mode: 'insensitive'`.

## Matriz módulo → rol
Ver `09-matriz-modulos-roles.md` para el control de visibilidad de menú/rutas en el frontend (equivale a `role_access` en SystemSetting + `allowed_paths` por usuario).