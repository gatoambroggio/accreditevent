// Resolución de la navegación del menú lateral combinando grupos (module_groups),
// el orden maestro (module_order), el modo por rol (grouped_by_role) y los
// permisos (visibleItems ya filtrados por rol/permisos en AppLayout).
//
// Modelo:
// - module_order es el orden de los MÓDULOS COMUNES (sueltos) en el menú.
// - module_groups define los grupos y el orden de los módulos DENTRO de cada
//   grupo (module_paths). Si el campo no es un array se derivan los grupos por
//   defecto (Estacionamiento, Vehículos, Barras).
// - En modo agrupado el menú muestra PRIMERO los módulos comunes (sueltos) en
//   orden de module_order, y DESPUÉS los grupos en el orden de module_groups.
// - grouped_by_role[rol] define si ese rol ve el menú agrupado (true) o plano
//   (false). Default: admin/superadmin agrupado, el resto plano.

import { MODULES } from '@/lib/modules';

export const DEFAULT_MODULE_GROUPS = [
  { id: 'estacionamiento', label: 'Estacionamiento', module_paths: ['/parking-sectors', '/parking-capacities'] },
  { id: 'vehiculos', label: 'Vehículos', module_paths: ['/registered-vehicles', '/vehicles'] },
  { id: 'barras', label: 'Barras', module_paths: ['/barras', '/barras-reportes', '/caja'] },
];

// Devuelve los grupos efectivos. Si el campo no es un array (no guardado aún),
// deriva los grupos por defecto. Un array vacío [] significa "sin grupos"
// (menú plano para quienes ven agrupado) y NO se reemplaza por defaults.
export function getModuleGroups(settings) {
  const g = settings?.module_groups;
  if (!Array.isArray(g)) {
    return DEFAULT_MODULE_GROUPS.map((x) => ({ ...x, module_paths: [...x.module_paths] }));
  }
  return g.map((x) => ({
    id: String(x.id || ''),
    label: x.label || 'Grupo',
    module_paths: Array.isArray(x.module_paths) ? x.module_paths : [],
  }));
}

export function isGroupedForRole(settings, role) {
  const m = settings?.grouped_by_role || {};
  if (typeof m[role] === 'boolean') return m[role];
  return role === 'admin' || role === 'superadmin';
}

// Devuelve una lista ordenada de entradas para el menú:
//   { type: 'item', item }  |  { type: 'group', group: { id, label, items: [NAV_ITEM...] } }
// allItems: NAV_ITEMS (con ícono). visibleItems: ya filtrados por rol/permisos.
export function resolveNav({ settings, role, allItems, visibleItems }) {
  const groups = getModuleGroups(settings);
  const grouped = isGroupedForRole(settings, role);

  const visibleByPath = {};
  visibleItems.forEach((it) => { visibleByPath[it.path] = it; });

  if (!grouped || groups.length === 0) {
    return visibleItems.map((it) => ({ type: 'item', item: it }));
  }

  const pathToGroup = {};
  groups.forEach((g) => g.module_paths.forEach((p) => { if (!pathToGroup[p]) pathToGroup[p] = g.id; }));

  const masterOrder = (settings?.module_order?.length ? settings.module_order : allItems.map((it) => it.path));
  const entries = [];
  const seen = new Set();

  // 1) Módulos comunes (sueltos, no agrupados) primero, en orden de module_order.
  for (const p of masterOrder) {
    if (pathToGroup[p]) continue;
    const it = visibleByPath[p];
    if (it) { entries.push({ type: 'item', item: it }); seen.add(p); }
  }
  // Sueltos visibles no listados en masterOrder.
  visibleItems.forEach((it) => {
    if (!seen.has(it.path) && !pathToGroup[it.path]) entries.push({ type: 'item', item: it });
  });

  // 2) Grupos después, en el orden definido en module_groups.
  groups.forEach((g) => {
    const gItems = g.module_paths.map((pp) => visibleByPath[pp]).filter(Boolean);
    if (gItems.length > 0) entries.push({ type: 'group', group: { id: g.id, label: g.label, items: gItems } });
  });

  return entries;
}