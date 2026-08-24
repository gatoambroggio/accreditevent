import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wallet, Download, Search, Filter } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import {
  RANGES,
  MOV_LABELS,
  MOV_COLORS,
  filterMovements,
  aggregateCash,
  closeDiff,
  exportCashXlsx,
} from '@/lib/cashReports';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function StatCard({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900" style={{ color }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Caja() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [bars, setBars] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');
  const [type, setType] = useState('all');
  const [barId, setBarId] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const evs = await base44.entities.Event.list('-start_at', 200);
        setEvents(evs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const load = async (id) => {
    if (!id) {
      setBars([]);
      setMovements([]);
      return;
    }
    setLoading(true);
    try {
      const [bs, ms] = await Promise.all([
        base44.entities.Bar.filter({ event_id: id }, 'name', 100),
        base44.entities.BarCashMovement.filter({ event_id: id }, '-created_date', 2000),
      ]);
      setBars(bs);
      setMovements(ms);
    } catch {}
    setLoading(false);
  };

  const filtered = useMemo(
    () => filterMovements(movements, { range, type, barId, q }),
    [movements, range, type, barId, q]
  );

  const stats = useMemo(() => aggregateCash(filtered), [filtered]);

  return (
    <div>
      <PageHeader kicker="Barras" title="Caja y retiros">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setBarId('all');
              load(e.target.value);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <option value="">Elegí un evento…</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {eventId && (
            <button
              onClick={() => exportCashXlsx(filtered, events.find((e) => e.id === eventId)?.name)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </button>
          )}
        </div>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Elegí un evento para ver los movimientos de caja.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Sin movimientos de caja en el filtro seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Aperturas" value={fmtCur(stats.openTotal)} color="#10b981" sub={`${stats.openCount} mov.`} />
            <StatCard label="Retiros" value={fmtCur(stats.withdrawTotal)} color="#ef4444" sub={`${stats.withdrawCount} mov.`} />
            <StatCard label="Contado en cierres" value={fmtCur(stats.countedTotal)} color="#6366f1" sub={`${stats.closeCount} cierres`} />
            <StatCard
              label="Diferencia de caja"
              value={fmtCur(stats.diffTotal)}
              color={Math.abs(stats.diffTotal) < 0.01 ? '#0f766e' : '#dc2626'}
              sub={`Esperado ${fmtCur(stats.expectedTotal)}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <Filter className="h-4 w-4 text-slate-400" />
            <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
              <option value="all">Todos los tipos</option>
              <option value="open">Aperturas</option>
              <option value="withdraw">Retiros</option>
              <option value="close">Cierres</option>
            </select>
            {bars.length > 0 && (
              <select value={barId} onChange={(e) => setBarId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
                <option value="all">Todas las barras</option>
                {bars.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Operador, responsable, DNI…"
                className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Barra</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2">Operador</th>
                    <th className="px-3 py-2">Responsable</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const diff = closeDiff(m);
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500">
                          {new Date(m.created_date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{m.bar_name || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: MOV_COLORS[m.type] || '#94a3b8' }}>
                            {MOV_LABELS[m.type] || m.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{fmtCur(m.amount)}</td>
                        <td className="px-3 py-2 text-slate-600">{m.operator_name || '-'}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {m.responsible_name ? `${m.responsible_name}${m.responsible_dni ? ` · ${m.responsible_dni}` : ''}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{m.note || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{m.balance_after != null ? fmtCur(m.balance_after) : '-'}</td>
                        <td className="px-3 py-2 text-right">
                          {diff != null ? (
                            <span className={`font-semibold ${Math.abs(diff) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {diff >= 0 ? '+' : ''}
                              {fmtCur(diff)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-semibold ${m.status === 'void' ? 'text-red-500' : 'text-slate-400'}`}>
                            {m.status === 'void' ? 'Anulado' : 'Activo'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}