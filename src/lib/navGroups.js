// Resoluci\u00f3n de la navegaci\u00f3n del men\u00fa lateral combinando grupos (module_groups),
// el orden maestro (module_order), el modo por rol (grouped_by_role) y los
// permisos (visibleItems ya filtrados por rol/permisos en AppLayout).
//
// Modelo:
// - module_order es el orden maestro de TODOS los m\u00f3dulos. En modo plano define
//   el orden del men\u00fa; en modo agrupado define la POSICI\u00d3N de cada grupo (el
//   grupo se renderiza donde aparece su primer miembro en module_order) y de
//   los m\u00f3dulos sueltos.
// - module_groups define los grupos y el orden de los m\u00f3dulos DENTRO de cada
//   grupo (module_paths). Si el campo no es un array se derivan los grupos
//   por defecto (Estacionamiento, Veh\u00edculos, Barras) para no romper el men\u00fa
//   de administradores existentes.
// - grouped_by_role[rol] define si ese rol ve el men\u00fa agrupado (true) o plano
//   (false). Default: admin/superadmin agrupado, el resto plano.

import { MODULES } from '@/lib/modules';

export const DEFAULT_MODULE_GROUPS = [
  { id: 'estacionamiento', label: 'Estacionamiento', module_paths: ['/parking-sectors', '/parking-capacities'] },
  { id: 'vehiculos', label: 'Veh\u00edculos', module_paths: ['/registered-vehicles', '/vehicles'] },
  { id: 'barras', label: 'Barras', module_paths: ['/barras', '/barras-reportes', '/caja'] },
];

// Devuelve los grupos efectivos. Si el campo no es un array (no guardado a\u00fan),
// deriva los grupos por defecto. Un array vac\u00edo [] significa "sin grupos"
// (men\u00fa plano para quienes ven agrupado) y NO se reemplaza por defaults.
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

// Devuelve una lista ordenada de entradas para el men\u00fa:
//   { type: 'item', item }  |  { type: 'group', group: { id, label, items: [NAV_ITEM...] } }
// allItems: NAV_ITEMS (con \u00edcono). visibleItems: ya filtrados por rol/permisos.
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
  const groupById = {};
  groups.forEach((g) => { groupById[g.id] = g; });

  const masterOrder = (settings?.module_order?.length ? settings.module_order : allItems.map((it) => it.path));
  const emitted = new Set();
  const seenPath = new Set();
  const entries = [];

  for (const p of masterOrder) {
    const gid = pathToGroup[p];
    if (gid) {
      if (emitted.has(gid)) continue;
      emitted.add(gid);
      const g = groupById[gid];
      const gItems = g.module_paths.map((pp) => visibleByPath[pp]).filter(Boolean);
      g.module_paths.forEach((pp) => seenPath.add(pp));
      if (gItems.length > 0) entries.push({ type: 'group', group: { id: g.id, label: g.label, items: gItems } });
    } else {
      const it = visibleByPath[p];
      if (it) { entries.push({ type: 'item', item: it }); seenPath.add(p); }
    }
  }

  // Grupos cuyos miembros no estaban en module_order (p.ej. grupos nuevos).
  groups.forEach((g) => {
    if (emitted.has(g.id)) return;
    const gItems = g.module_paths.map((pp) => visibleByPath[pp]).filter(Boolean);
    if (gItems.length > 0) {
      g.module_paths.forEach((pp) => seenPath.add(pp));
      entries.push({ type: 'group', group: { id: g.id, label: g.label, items: gItems } });
    }
  });

  // M\u00f3dulos sueltos visibles que no estaban en masterOrder.
  visibleItems.forEach((it) => {
    if (seenPath.has(it.path) || pathToGroup[it.path]) return;
    entries.push({ type: 'item', item: it });
  });

  return entries;
}