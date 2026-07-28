import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Download, Users, UserCheck } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import StatusBadge from '@/components/StatusBadge';
import { exportToExcel } from '@/lib/exportUtils';
import { parseServerDate } from '@/lib/formatDate';

const PHASE_LABELS = { armado: 'Armado', dia_evento: 'Show', desarme: 'Desarme' };

export default function RegisteredPeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ppl, evs] = await Promise.all([
          base44.entities.Person.list('-created_date', 500),
          base44.entities.Event.list('-created_date', 100),
        ]);
        setPeople(ppl);
        setEvents(evs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const eventMap = useMemo(() => {
    const m = {};
    events.forEach((e) => { m[e.id] = e; });
    return m;
  }, [events]);

  const filtered = useMemo(() => {
    let list = [...people];
    if (eventFilter) list = list.filter((p) => p.event_id === eventFilter);
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((p) =>
        `${p.full_name} ${p.document} ${p.email} ${p.company}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [people, eventFilter, query]);

  const stats = useMemo(() => ({
    total: filtered.length,
    active: filtered.filter((p) => p.status === 'active').length,
  }), [filtered]);

  const handleExport = () => {
    exportToExcel(
      ['Nombre', 'Documento', 'Empresa', 'Email', 'Teléfono', 'Evento', 'Estado', 'Registrado'],
      filtered.map((p) => [
        p.full_name || '',
        p.document || '',
        p.company || '',
        p.email || '',
        p.phone || '',
        p.event_id ? (eventMap[p.event_id]?.name || '—') : '—',
        p.status || '',
        p.created_date ? parseServerDate(p.created_date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '',
      ]),
      'personas_registradas'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Histórico" title="Personas registradas">
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Personas registradas</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.active}</p>
              <p className="text-xs text-slate-500">Activas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Nombre, documento, empresa…"
        />
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Todos los eventos"
        />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon={Users}
        emptyMessage="No hay personas registradas."
        tableClassName="min-w-[800px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Nombre</Th>
            <Th>Documento</Th>
            <Th>Empresa</Th>
            <Th>Email</Th>
            <Th>Evento</Th>
            <Th>Fases</Th>
            <Th>Estado</Th>
            <Th>Registrado</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <Tr key={p.id}>
              <Td>
                <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                {p.phone && <p className="text-xs text-slate-400">{p.phone}</p>}
              </Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p.document || '—'}</code></Td>
              <Td className="text-sm text-slate-600">{p.company || '—'}</Td>
              <Td className="text-sm text-slate-600">{p.email || '—'}</Td>
              <Td className="text-sm text-slate-600">
                {p.event_id ? (eventMap[p.event_id]?.name || '—') : '—'}
              </Td>
              <Td className="text-xs text-slate-500">
                {(p.event_phases && p.event_phases.length > 0)
                  ? p.event_phases.map((ph) => PHASE_LABELS[ph] || ph).join(', ')
                  : '—'}
              </Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td className="text-xs text-slate-400">
                {p.created_date ? parseServerDate(p.created_date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'}
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}