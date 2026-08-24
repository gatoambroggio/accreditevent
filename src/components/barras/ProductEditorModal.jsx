import React, { useState } from 'react';

export default function ProductEditorModal({ product, onClose, onSave }) {
  const [p, setP] = useState(product);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-bold text-slate-900">{product.id ? 'Editar producto' : 'Nuevo producto'}</h4>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre</label>
            <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Cerveza / Hamburguesa…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Categoría</label>
              <input value={p.category || ''} onChange={(e) => setP({ ...p, category: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Bebida / Comida" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Precio (ARS)</label>
              <input type="number" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.status === 'active'} onChange={(e) => setP({ ...p, status: e.target.checked ? 'active' : 'inactive' })} className="h-4 w-4 accent-emerald-600" />
            <span className="text-sm text-slate-700">Producto activo</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(p)} disabled={!p.name} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </div>
  );
}