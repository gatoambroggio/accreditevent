import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
import { MODULES, ROLES } from '@/lib/modules';
import { DEFAULT_MODULE_GROUPS, isGroupedForRole } from '@/lib/navGroups';

const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));

// Editor de grupos de m\u00f3dulos para el men\u00fa lateral. Permite crear/renombrar/
// eliminar grupos, reordenar grupos y m\u00f3dulos dentro de cada grupo (con \u25b2\u25bc),
// asignar m\u00f3dulos sueltos a un grupo, y definir qu\u00e9 roles ven el men\u00fa agrupado.
export default function ModuleGroupsEditor({ settings, update }) {
  const stored = settings?.module_groups;
  const groups = Array.isArray(stored)
    ? stored
    : DEFAULT_MODULE_GROUPS.map((g) => ({ ...g, module_paths: [...g.module_paths] }));
  const setGroups = (next) => update('module_groups', next);
  const groupedByRole = settings?.grouped_by_role || {};

  const labelByPath = Object.fromEntries(MODULES.map((m) => [m.path, m.label]));
  const sueltos = MODULES.filter((m) => !groups.some((g) => g.module_paths.includes(m.path)));

  const addGroup = () => setGroups([...groups, { id: newId(), label: 'Nuevo grupo', module_paths: [] }]);
  const renameGroup = (id, label) => setGroups(groups.map((g) => (g.id === id ? { ...g, label } : g)));
  const deleteGroup = (id) => setGroups(groups.filter((g) => g.id !== id));
  const moveGroup = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= groups.length) return;
    const next = groups.slice();
    const [g] = next.splice(idx, 1);
    next.splice(j, 0, g);
    setGroups(next);
  };
  const moveModuleInGroup = (gid, path, dir) => {
    setGroups(groups.map((g) => {
      if (g.id !== gid) return g;
      const paths = g.module_paths.slice();
      const i = paths.indexOf(path);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= paths.length) return g;
      const [x] = paths.splice(i, 1);
      paths.splice(j, 0, x);
      return { ...g, module_paths: paths };
    }));
  };
  const addModuleToGroup = (gid, path) => {
    setGroups(groups.map((g) => {
      const without = g.module_paths.filter((p) => p !== path);
      return g.id === gid ? { ...g, module_paths: [...without, path] } : { ...g, module_paths: without };
    }));
  };
  const removeModuleFromGroup = (gid, path) => {
    setGroups(groups.map((g) => (g.id === gid ? { ...g, module_paths: g.module_paths.filter((p) => p !== path) } : g)));
  };
  const toggleRoleGrouped = (r) => {
    const cur = isGroupedForRole(settings, r);
    update('grouped_by_role', { ...groupedByRole, [r]: !cur });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-600">\u00bfQu\u00e9 roles ven el men\u00fa agrupado?</p>
        <p className="mt-0.5 text-xs text-slate-400">Marc\u00e1 los roles que ven los grupos colapsables. Los no marcados ven el men\u00fa plano (respetando el orden de la matriz de arriba).</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const on = isGroupedForRole(settings, r);
            return (
              <button key={r} type="button" onClick={() => toggleRoleGrouped(r)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {r} \u00b7 {on ? 'agrupado' : 'plano'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {groups.map((g, idx) => (
          <div key={g.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex flex-col leading-none">
                <button type="button" onClick={() => moveGroup(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveGroup(idx, 1)} disabled={idx === groups.length - 1} className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
              </span>
              <input value={g.label} onChange={(e) => renameGroup(g.id, e.target.value)} placeholder="Nombre del grupo"
                className="normal-case flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              <button type="button" onClick={() => deleteGroup(g.id)} title="Eliminar grupo (los m\u00f3dulos quedan sueltos)" className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-1.5">
              {g.module_paths.length === 0 && <p className="px-2 text-xs text-slate-400">Sin m\u00f3dulos. Agreg\u00e1 desde los sueltos de abajo.</p>}
              {g.module_paths.map((p, i) => (
                <div key={p} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <span className="inline-flex flex-col leading-none">
                    <button type="button" onClick={() => moveModuleInGroup(g.id, p, -1)} disabled={i === 0} className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => moveModuleInGroup(g.id, p, 1)} disabled={i === g.module_paths.length - 1} className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                  </span>
                  <span className="flex-1 text-sm font-semibold text-slate-800">{labelByPath[p] || p}</span>
                  <button type="button" onClick={() => removeModuleFromGroup(g.id, p)} title="Sacar del grupo (queda suelto)" className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={addGroup} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
          <Plus className="h-4 w-4" /> Nuevo grupo
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600">M\u00f3dulos sueltos (sin grupo)</p>
        <p className="mt-0.5 text-xs text-slate-400">Se muestran como \u00edtems individuales. Mov\u00e9los a un grupo con el selector de la derecha.</p>
        <div className="mt-2 space-y-1.5">
          {sueltos.length === 0 && <p className="px-2 text-xs text-slate-400">Todos los m\u00f3dulos est\u00e1n en un grupo.</p>}
          {sueltos.map((m) => (
            <div key={m.path} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <span className="flex-1 text-sm font-semibold text-slate-800">{m.label}</span>
              <select defaultValue=""
                onChange={(e) => { if (e.target.value) { addModuleToGroup(e.target.value, m.path); e.target.value = ''; } }}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                <option value="">Mover a grupo\u2026</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}