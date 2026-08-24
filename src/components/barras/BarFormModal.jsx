import React, { useState } from 'react';

export default function BarFormModal({ bar, sectors = [], onClose, onSave }) {
  const [b, setB] = useState(bar);
  const toggleSector = (s) => {
    const cur = b.sectors || [];
    const has = cur.find((x) => x.value === s.value);
    setB({ ...b, sectors: has ? cur.filter((x) => x.value !== s.value) : [...cur, s] });
  };
  const isSel = (val) => (b.sectors || []).some((x) => x.value === val);
  const setAfipField = (k, v) => {
    const next = { ...(b.afip || {}) };
    if (v === '' || v === undefined || v === null) delete next[k];
    else next[k] = v;
    setB({ ...b, afip: next });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-bold text-slate-900">{bar.id ? 'Editar barra' : 'Nueva barra'}</h4>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre</label>
            <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Barra principal" />
          </div>
          {sectors.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sectores que atiende</label>
              <p className="mb-2 text-[11px] text-slate-400">Elegí los sectores del evento que esta barra cobra. En el POS se seleccionan con botones y cambian los precios.</p>
              <div className="flex flex-wrap gap-2">
                {sectors.map((s) => (
                  <button type="button" key={s.value} onClick={() => toggleSector(s)} className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition ${isSel(s.value) ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {(b.sectors || []).length === 0 && <p className="mt-1 text-xs text-slate-400">Sin sectores elegidos · el POS usará precio base.</p>}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs font-bold text-slate-700">Facturación AFIP por barra</p>
            <p className="mb-2 text-[11px] text-slate-400">Cada barra emite con su propio punto de venta (numeración independiente). El CUIT y certificado se heredan de la empresa productora.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Modo (override)</span>
                <select value={b.afip?.modo_override || ''} onChange={(e) => setAfipField('modo_override', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
                  <option value="">Heredar de la empresa</option>
                  <option value="production">Producción</option>
                  <option value="sandbox">Pruebas</option>
                  <option value="disabled">Desactivado</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Punto de venta</span>
                <input type="number" value={b.afip?.pto_vta ?? ''} onChange={(e) => setAfipField('pto_vta', e.target.value ? Number(e.target.value) : '')} placeholder="Ej. 1" className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
              </label>
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