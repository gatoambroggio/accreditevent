import React, { useState } from 'react';

export default function BarFormModal({ bar, onClose, onSave }) {
  const [b, setB] = useState(bar);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-bold text-slate-900">{bar.id ? 'Editar barra' : 'Nueva barra'}</h4>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre</label>
            <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Barra principal" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Ubicación</label>
            <input value={b.location || ''} onChange={(e) => setB({ ...b, location: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Sector VIP, junto al escenario…" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={b.status === 'active'} onChange={(e) => setB({ ...b, status: e.target.checked ? 'active' : 'inactive' })} className="h-4 w-4 accent-emerald-600" />
            <span className="text-sm text-slate-700">Barra activa</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(b)} disabled={!b.name} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </div>
  );
}