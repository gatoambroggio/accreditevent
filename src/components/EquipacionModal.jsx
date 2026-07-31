import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Plus, Trash2, Check, Package } from 'lucide-react';

export default function EquipacionModal({ accreditation, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(
      Array.isArray(accreditation?.equipacion)
        ? accreditation.equipacion.map((e) => ({ item: e.item || '', delivered: !!e.delivered }))
        : []
    );
    setNewItem('');
  }, [accreditation]);

  const addItem = () => {
    const v = newItem.trim();
    if (!v) return;
    setItems((prev) => [...prev, { item: v.toUpperCase(), delivered: false }]);
    setNewItem('');
  };

  const toggle = (idx) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, delivered: !it.delivered } : it)));
  };

  const remove = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Accreditation.update(accreditation.id, { equipacion: items });
      onSaved?.(items);
      onClose();
    } catch (e) {
      alert('No se pudo guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const deliveredCount = items.filter((i) => i.delivered).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Control de equipación</p>
            <h3 className="text-lg font-bold text-slate-900">{accreditation?.person_name || 'Personal'}</h3>
            <p className="text-xs text-slate-400">{accreditation?.badge_code} · {accreditation?.event_name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
              placeholder="Ej: Campera, Radio, Credencial…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <button onClick={addItem} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Package className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Sin ítems de equipación. Agregá los que correspondan.</p>
              </div>
            ) : (
              items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <button onClick={() => toggle(idx)} className="flex flex-1 items-center gap-3 text-left">
                    <span className={`grid h-6 w-6 place-items-center rounded-md border ${it.delivered ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className={`text-sm font-medium ${it.delivered ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{it.item}</span>
                  </button>
                  <button onClick={() => remove(idx)} className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <p className="text-sm text-slate-500">
            <span className="font-bold text-emerald-700">{deliveredCount}</span> de <span className="font-bold text-slate-700">{items.length}</span> entregados
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}