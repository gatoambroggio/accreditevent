import React, { useState } from 'react';

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export default function BarFormModal({ bar, onClose, onSave }) {
  const [b, setB] = useState(bar);
  const sectors = b.sectors || [];
  const addSector = () => setB({ ...b, sectors: [...sectors, { value: '', label: '' }] });
  const updSector = (i, key, val) => {
    const arr = [...sectors];
    arr[i] = { ...arr[i], [key]: val };
    if (key === 'label' && !arr[i].value) arr[i].value = slug(val);
    setB({ ...b, sectors: arr });
  };
  const delSector = (i) => setB({ ...b, sectors: sectors.filter((_, idx) => idx !== i) });
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
          <div>
            <div className="flex items-center justify-between">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sectores / precios</label>
              <button type="button" onClick={addSector} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-800">+ Sector</button>
            </div>
            <p className="mb-2 text-[11px] text-slate-400">Sectores que atiende esta barra. En el POS se elige con un selector y cambian los precios.</p>
            <div className="space-y-2">
              {sectors.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s.label} onChange={(e) => updSector(i, 'label', e.target.value)} placeholder="Ej. VIP" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  <input value={s.value} onChange={(e) => updSector(i, 'value', slug(e.target.value))} placeholder="slug" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono text-slate-500" />
                  <button type="button" onClick={() => delSector(i)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50">×</button>
                </div>
              ))}
              {sectors.length === 0 && <p className="text-xs text-slate-400">Sin sectores. El POS usará el precio base.</p>}
            </div>
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