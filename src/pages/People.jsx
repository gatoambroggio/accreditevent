import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Download, Trash2, Pencil, Eye, Users } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import PersonDetailModal from '@/components/PersonDetailModal';
import { useCrud } from '@/lib/crud';
import { usePagination } from '@/lib/usePagination';
import { useZones } from '@/lib/useZones';
import { exportToExcel } from '@/lib/exportUtils';
import { getUserCompany } from '@/lib/userCompany';

const PHASE_OPTIONS = [
  { value: 'armado', label: 'Armado' },
  { value: 'dia_evento', label: 'Show' },
  { value: 'desarme', label: 'Desarme' },
];

const EMPLOYMENT_OPTIONS = [
  { value: 'fijo', label: 'Fijo' },
  { value: 'eventual', label: 'Eventual' },
];

export default function People() {
  const { user } = useAuth();
  const { items: people, loading, error, create, update, remove } = useCrud('Person');
  const { zones } = useZones();
  const [events, setEvents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    Promise.all([
      base44.entities.Event.list('-created_date', 200),
      base44.entities.Company.list('-created_date', 100),
    ]).then(([evs, comps]) => {
      setEvents(evs);
      setCompanies(comps);
    }).catch(() => {});
  }, []);

  const userCompany = getUserCompany(user);
  const isProductora = user?.role === 'productora';
  const isEmpresa = user?.role === 'empresa';

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (isProductora && p.productora !== userCompany && p.company !== userCompany) return false;
      if (isEmpresa && p.company !== userCompany) return false;
      if (eventFilter && p.event_id !== eventFilter && !(p.event_ids || []).includes(eventFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.full_name?.toLowerCase().includes(q) ||
               p.document?.includes(q) ||
               p.company?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [people, search, eventFilter, isProductora, isEmpresa, userCompany]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const fields = useMemo(() => [
    { name: 'full_name', label: 'Nombre completo', required: true },
    { name: 'document', label: 'DNI', type: 'dni' },
    {
      name: 'company', label: 'Empresa proveedora', type: 'select',
      options: companies.map((c) => ({ value: c.name, label: c.name })),
      defaultValue: isEmpresa ? userCompany : '',
    },
    { name: 'phone', label: 'Teléfono', type: 'phone-ar' },
    { name: 'email', label: 'Email', type: 'email' },
    {
      name: 'access_area', label: 'Área de acceso', type: 'select',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
    },
    { name: 'employment_type', label: 'Tipo de contratación', type: 'select', options: EMPLOYMENT_OPTIONS, defaultValue: 'fijo' },
    {
      name: 'event_id', label: 'Evento principal', type: 'searchable-select', full: true,
      options: events.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      name: 'event_phases', label: 'Fases del evento', type: 'toggle-group', full: true,
      options: PHASE_OPTIONS,
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    { name: 'status', label: 'Estado', type: 'select', options: [
      { value: 'active', label: 'Activo' },
      { value: 'inactive', label: 'Inactivo' },
      { value: 'pending', label: 'Pendiente' },
    ], defaultValue: 'active' },
  ], [zones, events, companies, isEmpresa, userCompany]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p) => { setEditing(p); setModalOpen(true); };

  const handleSubmit = async (data) => {
    // Sync person_type with access_area
    const personData = {
      ...data,
      person_type: data.access_area || 'general',
    };
    // Denormalize event name
    const evt = events.find((e) => e.id === data.event_id);
    if (evt) {
      personData.productora = evt.company;
      if (!personData.event_ids || personData.event_ids.length === 0) {
        personData.event_ids = [evt.id];
      }
      if (!personData.event_names || personData.event_names.length === 0) {
        personData.event_names = [evt.name];
      }
    }
    if (editing) {
      await update(editing.id, personData);
    } else {
      await create(personData);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Eliminar ${selected.size} personas? Esta acción no se puede deshacer.`)) return;
    await Promise.all([...selected].map((id) => remove(id)));
    setSelected(new Set());
  };

  const handleExport = () => {
    const headers = ['Nombre', 'DNI', 'Empresa', 'Área', 'Contratación', 'Email', 'Teléfono', 'Estado'];
    const rows = filtered.map((p) => [
      p.full_name, p.document, p.company, p.access_area, p.employment_type, p.email, p.phone, p.status,
    ]);
    exportToExcel(headers, rows, 'personas');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Personas">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva persona
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, DNI o empresa…" />
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Todos los eventos"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-700">{selected.size} seleccionada(s)</span>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        </div>
      )}

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        error={error}
        emptyMessage="No hay personas cargadas."
        skeletonCols={7}
      >
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th className="w-8">
              <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            </Th>
            <Th>Nombre</Th>
            <Th>DNI</Th>
            <Th>Empresa</Th>
            <Th>Área</Th>
            <Th>Fases</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((p) => (
            <Tr key={p.id}>
              <Td>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              </Td>
              <Td>
                <button onClick={() => setDetailOpen(p)} className="text-left transition hover:text-emerald-700">
                  <p className="font-semibold text-slate-900">{p.full_name}</p>
                  {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                </button>
              </Td>
              <Td className="text-sm text-slate-600">{p.document || '—'}</Td>
              <Td className="text-sm text-slate-600">{p.company || '—'}</Td>
              <Td>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {zones.find((z) => z.value === p.access_area)?.label || p.access_area || '—'}
                </span>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(p.event_phases) ? p.event_phases : []).map((ph) => (
                    <span key={ph} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {PHASE_OPTIONS.find((o) => o.value === ph)?.label || ph}
                    </span>
                  ))}
                </div>
              </Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setDetailOpen(p)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Ver detalle">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.full_name : 'Nueva persona'}
        kicker={editing ? 'EDITAR PERSONA' : 'CREAR PERSONA'}
        fields={fields}
        initialData={editing || { status: 'active', employment_type: 'fijo', event_phases: [] }}
        onSubmit={handleSubmit}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar cambios' : 'Crear persona'}
      />

      {detailOpen && (
        <PersonDetailModal person={detailOpen} onClose={() => setDetailOpen(null)} />
      )}
    </div>
  );
}