import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, X } from 'lucide-react';

export default function WithdrawOperatorModal({ eventId, event, existing, op, onClose, onSaved }) {
  const edit = !!op;
  const [firstName, setFirstName] = useState(op?.first_name || '');
  const [lastName, setLastName] = useState(op?.last_name || '');
  const [dni, setDni] = useState(op?.dni || '');
  const [status, setStatus] = useState(op?.status || 'active');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    const fn = firstName.trim();
    const ln = lastName.trim();
    const d = dni.trim();
    if (!fn || !ln) { setErr('Nombre y apellido son obligatorios'); return; }
    if (!d) { setErr('El DNI es obligatorio'); return; }
    const dup = existing.find((x) => x.id !== op?.id && String(x.dni).toLowerCase() === d.toLowerCase());
    if (dup) { setErr(`Ya existe un retirador con DNI ${d} en este evento`); return; }
    setBusy(true);
    try {
      const payload = {
        event_id: eventId,
        event_name: event?.name || '',
        company: event?.company || '',
        first_name: fn,
        last_name: ln,
        dni: d,
        status,
      };
      if (edit) await base44.entities.WithdrawOperator.update(op.id, payload);
      else await base44.entities.WithdrawOperator.create(payload);
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">{edit ? 'Editar retirador' : 'Nuevo retirador'}</h3>
          <button onClick={() => !busy && onClose()} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre *</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Apellido *</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">DNI *</span>
            <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" className="normal-case w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </label>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => !busy && onClose()} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {edit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}