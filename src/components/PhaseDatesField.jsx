import React from 'react';

const PHASE_LABELS = {
  armado: 'Armado',
  dia_evento: 'Show',
  desarme: 'Desarme',
};

export default function PhaseDatesField({ phases = [], phaseDates = [], onChange }) {
  const getVal = (phase, field) => phaseDates.find((p) => p.phase === phase)?.[field] || '';

  const setVal = (phase, field, value) => {
    const existing = phaseDates.find((p) => p.phase === phase);
    let next;
    if (existing) {
      next = phaseDates.map((p) => (p.phase === phase ? { ...p, [field]: value } : p));
    } else {
      next = [...phaseDates, { phase, start_date: '', end_date: '', [field]: value }];
    }
    onChange(next);
  };

  if (!phases.length) {
    return <p className="text-xs text-slate-400">Seleccioná al menos una fase para definir rangos de fecha.</p>;
  }

  return (
    <div className="space-y-2">
      {phases.map((phase) => (
        <div key={phase} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-semibold text-slate-600">{PHASE_LABELS[phase] || phase}</span>
          <input
            type="date"
            value={getVal(phase, 'start_date')}
            onChange={(e) => setVal(phase, 'start_date', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <span className="text-xs text-slate-400">→</span>
          <input
            type="date"
            value={getVal(phase, 'end_date')}
            onChange={(e) => setVal(phase, 'end_date', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      ))}
    </div>
  );
}