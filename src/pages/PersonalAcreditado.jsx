import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Users, BadgeCheck, Fingerprint } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { PHASE_LABELS } from '@/lib/eventPhases';

export default function PersonalAcreditado() {
  const [events, setEvents] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [evs, accs, ps] = await Promise.all([
          base44.entities.Event.list('-created_date', 200),
          base44.entities.Accreditation.list('-created_date', 500),
          base44.entities.Person.list('-created_date', 500),
        ]);
        setEvents(evs);
        // Personal acreditado = acreditaciones activas/autorizadas (no bloqueadas ni revocadas)
        setAccreditations(accs.filter((a) => a.status === 'active'));
        setPeople(ps);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const peopleById = useMemo(() => {
    const map = {};
    people.forEach((p) => { map[p.id] = p; });
    return map;
  }, [people]);

  const phaseLabel = (ph) => {
    if (!Array.isArray(ph) || ph.length === 0) return '—';
    return ph.map((v) => PHASE_LABELS[v] || v).join(', ');
  };

  const rows = useMemo(() => {
    let result = accreditations;
    if (eventFilter) result = result.filter((a) => a.event_id === eventFilter);
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((a) => {
        const p = peopleById[a.person_id] || {};
        return `${a.person_name} ${a.badge_code} ${a.person_type} ${p.document || ''}`.toLowerCase().includes(q);
      });
    }
    return result;
  }, [accreditations, eventFilter, query, peopleById]);

  const { page, setPage, totalPages, paginated } = usePagination(rows, 15);

  const eventOptions = useMemo(
    () => events.map((e) => ({ value: e.id, label: e.name })),
    [events]
  );

  const handleExport = () => {
    const headers = ['Nombre', 'Documento', 'Tipo', 'Área', 'Zonas de acceso', 'Días/Fases', 'Biometría', 'Credencial', 'Empresa', 'Evento', 'Estado'];
    const data = rows.map((a) => {
      const p = peopleById[a.person_id] || {};
      return [
        a.person_name || '',
        p.document || '',
        a.person_type || '',
        a.area || '',
        a.access_level || '',
        phaseLabel(a.event_phases),
        a.has_biometric ? 'Sí' : 'No',
        a.badge_code || '',
        a.company || '',
        a.event_name || '',
        a.status || '',
      ];
    });
    exportToExcel(headers, data, 'personal_acreditado');
  };

  const eventName = (id) => events.find((e) => e.id === id)?.name || '—';
  const selectedEventName = eventFilter ? eventName(eventFilter) : 'Todos los eventos';

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Personal acreditado">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar Excel
        </button>
      </PageHeader>

      <p className="text-sm text-slate-500 max-w-3xl">
        Listado de todas las personas <strong>acreditadas y autorizadas</strong> (estado activo) para el evento seleccionado.
        No incluye bloqueadas ni revocadas.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={eventOptions}
          placeholder="Todos los eventos"
          className="sm:max-w-xs"
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, credencial, documento…" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={rows.length === 0}
        emptyIcon={Users}
        emptyMessage="No hay personal acreditado y autorizado para el filtro seleccionado."
        skeletonCols={7}
      >
        <thead>
          <tr className="border-b border-slate-100">
            <Th>Nombre</Th>
            <Th>Documento</Th>
            <Th>Tipo</Th>
            <Th>Área</Th>
            <Th>Zonas</Th>
            <Th>Días/Fases</Th>
            <Th>Bio</Th>
            <Th>Credencial</Th>
            <Th>Evento</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => {
            const p = peopleById[a.person_id] || {};
            return (
              <Tr key={a.id}>
                <Td className="font-medium text-slate-800">{a.person_name || '—'}</Td>
                <Td className="text-slate-600">{p.document || '—'}</Td>
                <Td className="text-slate-600">{a.person_type || '—'}</Td>
                <Td className="text-slate-600">{a.area || '—'}</Td>
                <Td className="text-slate-600">{a.access_level || '—'}</Td>
                <Td className="text-slate-600 text-xs">{phaseLabel(a.event_phases)}</Td>
                <Td>
                  {a.has_biometric ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600"><Fingerprint className="h-3.5 w-3.5" /></span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td className="font-mono text-xs text-slate-700">{a.badge_code || '—'}</Td>
                <Td className="text-slate-600">{a.event_name || '—'}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <StatusBadge status={a.status} />
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

      {!loading && rows.length > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={15} />
      )}

      <p className="text-xs text-slate-400">
        Mostrando {rows.length} {rows.length === 1 ? 'persona autorizada' : 'personas autorizadas'} — {selectedEventName}.
      </p>
    </div>
  );
}