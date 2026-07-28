import React, { useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';

export default function EmployeeFormModal({ open, onClose, onSubmit, editing, companyName }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    if (editing) {
      const parts = (editing.full_name || '').split(' ');
      return {
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        document: editing.document || '',
        phone: editing.phone || '',
        email: editing.email || '',
        employment_type: editing.employment_type || 'fijo',
        notes: editing.notes || '',
      };
    }
    return { first_name: '', last_name: '', document: '', phone: '', email: '', employment_type: 'fijo', notes: '' };
  });

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const full_name = `${form.first_name} ${form.last_name}`.trim();
    if (!full_name) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        full_name,
        document: form.document,
        phone: form.phone,
        email: form.email,
        employment_type: form.employment_type,
        notes: form.notes,
        company: companyName,
        person_type: 'provider',
        status: 'active',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">{editing ? 'Editar' : 'Nuevo'} empleado</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{editing ? editing.full_name : 'Cargar empleado'}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre *</span>
              <input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} required className={inputCls} placeholder="Juan" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Apellido *</span>
              <input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} required className={inputCls} placeholder="Pérez" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Documento (DNI)</span>
              <input value={form.document} onChange={(e) => setField('document', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} placeholder="12345678" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono</span>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} type="tel" className={inputCls} placeholder="11 12345678" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email</span>
            <input value={form.email} onChange={(e) => setField('email', e.target.value)} type="email" className={inputCls} placeholder="empleado@email.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de contratación</span>
            <select value={form.employment_type} onChange={(e) => setField('employment_type', e.target.value)} className={inputCls}>
              <option value="fijo">Fijo</option>
              <option value="esporadico">Esporádico</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Notas (opcional)</span>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className={inputCls} placeholder="Observaciones internas…" />
          </label>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}