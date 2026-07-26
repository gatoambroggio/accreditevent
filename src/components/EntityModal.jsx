import React, { useState, useEffect } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';

export default function EntityModal({
  open,
  onClose,
  title,
  kicker = 'EDITAR REGISTRO',
  fields = [],
  initialData = {},
  onSubmit,
  onDelete,
  canDelete = false,
  submitLabel = 'Guardar',
}) {
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setData(initialData || {});
      setError('');
    }
  }, [open, initialData]);

  if (!open) return null;

  const setField = (name, value) => setData((d) => ({ ...d, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    setSaving(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f) => {
    const value = data[f.name] ?? f.defaultValue ?? '';
    const common = {
      id: f.name,
      value: f.type === 'checkbox' ? undefined : value,
      checked: f.type === 'checkbox' ? !!value : undefined,
      onChange: (e) => setField(f.name, f.type === 'checkbox' ? e.target.checked : e.target.value),
      required: f.required,
      className: 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20',
    };

    if (f.type === 'select') {
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <select {...common}>
            <option value="">Seleccionar…</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (f.type === 'textarea') {
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <textarea {...common} rows={3} />
        </label>
      );
    }

    if (f.type === 'checkbox') {
      return (
        <label key={f.name} className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" {...common} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
          <span className="text-sm font-medium text-slate-700">{f.label}</span>
        </label>
      );
    }

    if (f.type === 'datetime-local') {
      const val = value ? String(value).slice(0, 16) : '';
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <input type="datetime-local" {...common} value={val} />
        </label>
      );
    }

    return (
      <label key={f.name} className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
        <input type={f.type || 'text'} {...common} placeholder={f.placeholder || ''} />
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">{kicker}</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
                {renderField(f)}
              </div>
            ))}
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div>
              {canDelete && onDelete && (
                <button type="button" onClick={handleDelete} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}