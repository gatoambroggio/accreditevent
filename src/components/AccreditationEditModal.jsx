import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SETUP_PHASE_OPTIONS, buildShowDayOptions, PHASE_EXCLUSIVE_GROUPS, getShowDays } from '@/lib/eventPhases';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo (autorizado)' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'revoked', label: 'Revocado' },
];

export default function AccreditationEditModal({ open, onClose, accreditation, events, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (accreditation) {
      setForm({
        area: accreditation.area || '',
        access_level: accreditation.access_level || '',
        event_phases: Array.isArray(accreditation.event_phases) ? [...accreditation.event_phases] : [],
        status: accreditation.status || 'active',
        block_reason: accreditation.block_reason || '',
        has_biometric: !!accreditation.has_biometric,
      });
      setErr('');
    }
  }, [accreditation]);

  if (!open || !form) return null;

  const showDays = getShowDays(events, accreditation?.event_id);
  const setupOptions = SETUP_PHASE_OPTIONS;
  const showOptions = buildShowDayOptions(showDays);

  const togglePhase = (value) => {
    let phases = form.event_phases.includes(value)
      ? form.event_phases.filter((p) => p !== value)
      : [...form.event_phases, value];
    // Exclusividad: si activé un valor de un grupo, quito los del otro grupo
    if (!form.event_phases.includes(value)) {
      const group = PHASE_EXCLUSIVE_GROUPS.find((g) => g.includes(value));
      if (group) {
        const otherGroup = PHASE_EXCLUSIVE_GROUPS.find((g) => !g.includes(value));
        if (otherGroup) phases = phases.filter((p) => !otherGroup.includes(p));
      }
    }
    setForm({ ...form, event_phases: phases });
  };

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const payload = {
        area: form.area,
        access_level: form.access_level,
        event_phases: form.event_phases,
        status: form.status,
        block_reason: form.status === 'active' ? '' : form.block_reason,
        has_biometric: form.has_biometric,
      };
      await base44.entities.Accreditation.update(accreditation.id, payload);
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Editar acreditación</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold text-slate-700">{accreditation?.person_name}</p>
            <p className="font-mono text-xs text-slate-500">Credencial: {accreditation?.badge_code}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Área</label>
              <input
                type="text"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Zonas de acceso</label>
              <input
                type="text"
                value={form.access_level}
                onChange={(e) => setForm({ ...form, access_level: e.target.value })}
                placeholder="general, backstage…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Montaje</p>
            <div className="flex flex-wrap gap-2">
              {setupOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => togglePhase(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    form.event_phases.includes(opt.value)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase text-slate-500">Días de show</p>
            <div className="flex flex-wrap gap-2">
              {showOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => togglePhase(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    form.event_phases.includes(opt.value)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">"Todo el show" y los días específicos son excluyentes entre sí.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Estado</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.has_biometric}
                  onChange={(e) => setForm({ ...form, has_biometric: e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                Tiene biometría
              </label>
            </div>
          </div>

          {form.status !== 'active' && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Motivo de bloqueo/revocación</label>
              <textarea
                value={form.block_reason}
                onChange={(e) => setForm({ ...form, block_reason: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}