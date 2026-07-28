import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import PageHeader from '@/components/ui/page-header';
import FilterSelect from '@/components/ui/filter-select';
import { formatDateTime } from '@/lib/formatDate';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#6366f1'];

export default function Reports() {
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [accreditations, setAccreditations] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [evs, accs, logs, ps] = await Promise.all([
          base44.entities.Event.list('-created_date', 200),
          base44.entities.Accreditation.list('-created_date', 500),
          base44.entities.AccessLog.list('-created_date', 500),
          base44.entities.Person.list('-created_date', 200),
        ]);
        setEvents(evs);
        setAccreditations(accs);
        setAccessLogs(logs);
        setPeople(ps);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filteredAccreds = useMemo(() => {
    return eventFilter ? accreditations.filter((a) => a.event_id === eventFilter) : accreditations;
  }, [accreditations, eventFilter]);

  const filteredLogs = useMemo(() => {
    return eventFilter ? accessLogs.filter((l) => l.event_id === eventFilter) : accessLogs;
  }, [accessLogs, eventFilter]);

  const byArea = useMemo(() => {
    const map = {};
    filteredAccreds.forEach((a) => {
      const area = a.access_level || 'general';
      map[area] = (map[area] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredAccreds]);

  const byResult = useMemo(() => {
    const granted = filteredLogs.filter((l) => l.result === 'granted').length;
    const denied = filteredLogs.filter((l) => l.result === 'denied').length;
    return [
      { name: 'Permitidos', value: granted },
      { name: 'Denegados', value: denied },
    ];
  }, [filteredLogs]);

  const byEvent = useMemo(() => {
    const map = {};
    accreditations.forEach((a) => {
      const name = a.event_name || 'Sin evento';
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map).slice(0, 8).map(([name, value]) => ({ name: name.slice(0, 20), value }));
  }, [accreditations]);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Análisis" title="Reportes">
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={events.map((e) => ({ value: e.id, label: e.name }))} placeholder="Todos los eventos" />
      </PageHeader>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando datos…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Eventos', value: events.length },
              { label: 'Personas', value: people.length },
              { label: 'Acreditaciones', value: filteredAccreds.length },
              { label: 'Accesos', value: filteredLogs.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{s.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-900">Acreditaciones por evento</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byEvent}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-slate-900">Acreditaciones por área</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byArea} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {byArea.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h2 className="mb-4 font-bold text-slate-900">Accesos: permitidos vs denegados</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byResult}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}