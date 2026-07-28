import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatDateTime } from '@/lib/formatDate';
import { Radio, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import FilterSelect from '@/components/ui/filter-select';

export default function AccessMonitor() {
  const [logs, setLogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Event.list('-created_date', 50).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    let unsubscribe = null;
    const load = async () => {
      try {
        const data = await base44.entities.AccessLog.list('-created_date', 100);
        setLogs(data);
        setLoading(false);
        // Subscribe to real-time updates
        unsubscribe = base44.entities.AccessLog.subscribe((event) => {
          setLogs((prev) => {
            if (event.type === 'create') return [event.data, ...prev].slice(0, 100);
            return prev;
          });
        });
      } catch { setLoading(false); }
    };
    load();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const filtered = logs.filter((l) => {
    if (eventFilter && l.event_id !== eventFilter) return false;
    if (resultFilter && l.result !== resultFilter) return false;
    return true;
  });

  const granted = filtered.filter((l) => l.result === 'granted').length;
  const denied = filtered.filter((l) => l.result === 'denied').length;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Tiempo real" title="Monitor de accesos">
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500"><Radio className="h-4 w-4" /><span className="text-xs font-semibold">Total</span></div>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /><span className="text-xs font-semibold">Permitidos</span></div>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{granted}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700"><XCircle className="h-4 w-4" /><span className="text-xs font-semibold">Denegados</span></div>
          <p className="mt-1 text-2xl font-extrabold text-red-700">{denied}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={events.map((e) => ({ value: e.id, label: e.name }))} placeholder="Todos los eventos" />
        <FilterSelect value={resultFilter} onChange={setResultFilter} options={[
          { value: 'granted', label: 'Permitidos' },
          { value: 'denied', label: 'Denegados' },
        ]} placeholder="Todos los resultados" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-50">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">Sin actividad reciente.</div>
          ) : (
            filtered.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    log.result === 'granted' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {log.result === 'granted' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{log.person_name || log.badge_code}</p>
                    <p className="text-xs text-slate-400">
                      {log.event_name} · {log.zone || 'Sin zona'} · {log.method}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500">{formatDateTime(log.created_date)}</p>
                  <p className="text-[10px] text-slate-400">{log.access_level || ''}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}