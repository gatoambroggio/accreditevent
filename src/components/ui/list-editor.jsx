import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function ListEditor({ items = [], onChange, valuePlaceholder = 'slug', labelPlaceholder = 'Nombre visible' }) {
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const add = () => {
    if (!newValue.trim() || !newLabel.trim()) return;
    onChange([...items, { value: newValue.trim(), label: newLabel.trim() }]);
    setNewValue('');
    setNewLabel('');
  };

  const remove = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, val) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  };

  const inputCls = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={item.value}
                onChange={(e) => updateItem(idx, 'value', e.target.value)}
                className={`w-1/3 ${inputCls}`}
                placeholder={valuePlaceholder}
              />
              <input
                value={item.label}
                onChange={(e) => updateItem(idx, 'label', e.target.value)}
                className={`flex-1 ${inputCls}`}
                placeholder={labelPlaceholder}
              />
              <button type="button" onClick={() => remove(idx)} className="rounded-md p-2 text-red-500 transition hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className={`w-1/3 ${inputCls}`}
          placeholder={valuePlaceholder}
        />
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className={`flex-1 ${inputCls}`}
          placeholder={labelPlaceholder}
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
    </div>
  );
}