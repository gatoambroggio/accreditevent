import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Users, CheckCircle2, XCircle, DoorOpen, FileBarChart } from 'lucide-react';

const ZONE_LABELS = {
  general: 'General',
  backstage: 'Backstage',
  technical: 'Técnica',
  vip: 'VIP',
};

export default function Reports() {
  const [events, setEvents] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [evs, accs, logs] = await Promise.all([
          base44.entities.Event.list('-created_date', 100),
          base44.entities.Accreditation.list('-created_date', 500),
          base44.entities.AccessLog.list('-created_date', 500),
        ]);
        setEvents(evs);
        setAccreditations(accs);
        setAccessLogs(logs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filteredLogs = useMemo(() => {
    let logs = accessLogs;
    if (eventFilter) {
      const evt = events.find((e) => e.id === eventFilter);
      if (evt) logs = logs.filter((l) => l.event_name === evt.name);
    }
    if (resultFilter) {
      logs = logs.filter((l) => (resultFilter === 'granted' ? l.result !== 'denied' : l.result === 'denied'));
    }
    return logs;
  }, [accessLogs, eventFilter, resultFilter, events]);

  const filteredAccreditations = useMemo(() => {
    if (!eventFilter) return accreditations;
    return accreditations.filter((a) => a.event_id === eventFilter);
  }, [accreditations, eventFilter]);

  const stats = useMemo(() => {
    const totalAccredited = filteredAccreditations.length;
    const granted = filteredLogs.filter((l) => l.result !== 'denied').length;
    const denied = filteredLogs.filter((l) => l.result === 'denied').length;
    return { totalAccredited, granted, denied };
  }, [filteredAccreditations, filteredLogs]);

  const personStats = useMemo(() => {
    const map = {};
    for (const log of filteredLogs) {
      const key = log.person_name || log.badge_code || 'Desconocido';
      if (!map[key]) {
        map[key] = { name: key, badge_code: log.badge_code, granted: 0, denied: 0, zones: {} };
      }
      if (log.result === 'denied') {
        map[key].denied++;
      } else {
        map[key].granted++;
        const zone = log.zone || 'general';
        map[key].zones[zone] = (map[key].zones[zone] || 0) + 1;
      }
    }
    return Object.values(map).sort((a, b) => (b.granted + b.denied) - (a.granted + a.denied));
  }, [filteredLogs]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Análisis</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Reportes</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Evento</label>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos los eventos</option>
            {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Resultado</label>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos</option>
            <option value="granted">Concedidos</option>
            <option value="denied">Denegados</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.totalAccredited}</p>
              <p className="text-xs text-slate-500">Acreditados</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.granted}</p>
              <p className="text-xs text-slate-500">Ingresos concedidos</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.denied}</p>
              <p className="text-xs text-slate-500">Accesos denegados</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <DoorOpen className="h-4 w-4 text-emerald-600" /> Accesos por persona
          </h2>
        </div>
        {personStats.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No hay registros de acceso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Credencial</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Ingresos</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Denegados</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Zonas accedidas</th>
                </tr>
              </thead>
              <tbody>
                {personStats.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{p.name}</td>
                    <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p.badge_code || '—'}</code></td>
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{p.granted}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-600">{p.denied || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {Object.entries(p.zones).map(([zone, count]) => (
                        <span key={zone} className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5">
                          {ZONE_LABELS[zone] || zone}: {count}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileBarChart className="h-4 w-4 text-emerald-600" /> Registro de accesos
          </h2>
        </div>
        {filteredLogs.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No hay registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Zona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Resultado</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Método</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Usuario</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{log.person_name || '—'}</p>
                      <p className="text-xs text-slate-400">{log.badge_code}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{ZONE_LABELS[log.zone] || log.zone || '—'}</td>
                    <td className="px-4 py-3">
                      {log.result === 'denied' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-200">Denegado</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200">Concedido</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{log.method === 'biometric' ? 'Facial' : 'Manual'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{log.verified_by || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(log.created_date).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}