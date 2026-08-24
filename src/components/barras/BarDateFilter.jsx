import React from 'react';
import { Calendar } from 'lucide-react';
import { RANGES, PAY_LABELS } from '@/lib/barReports';

export default function BarDateFilter({ range, setRange, method, setMethod }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-slate-500">
        <Calendar className="h-4 w-4" />
        <span className="text-xs font-bold uppercase">Período</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <button key={r.value} onClick={() => setRange(r.value)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${range === r.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="mx-2 h-6 w-px bg-slate-200" />
      <span className="text-xs font-bold uppercase text-slate-500">Pago</span>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
        <option value="all">Todos</option>
        {Object.entries(PAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}