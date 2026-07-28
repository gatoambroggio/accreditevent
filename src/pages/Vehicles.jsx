import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Download, Trash2, Pencil, Car } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import VehicleBadgePrint from '@/components/VehicleBadgePrint';
import BatchVehicleBadgePrint from '@/components/BatchVehicleBadgePrint';
import { useCrud } from '@/lib/crud';
import { usePagination } from '@/lib/usePagination';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { exportToExcel } from '@/lib/exportUtils';
import { getUserCompany } from '@/lib/userCompany';
import { useAuth } from '@/lib/AuthContext';

const STATUS_OPTIONS = [
  { value: 'approved', label: 'Aprobado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'rejected', label: 'Rechazado' },
];

export default function Vehicles() {
  const { user } = useAuth();
  const { items: vehicles, loading, error, create, update, remove } = useCrud('Vehicle');
  const { sectors } = useParkingSectors();
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [printVehicle, setPrintVehicle] = useState(null);
  const [batchPrint, setBatchPrint] = useState([]);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    Promise.all([
      base44.entities.Person.list('-created_date', 200),
      base44.entities.Event.list('-created_date', 200),
    ]).then(([ps, evs]) => { setPeople(ps); setEvents(evs); }).catch(() => {});
  }, []);

  const userCompany = getUserCompany(user);
  const isProductora = user?.role === 'productora';

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (isProductora && v.company !== userCompany) return false;
      if (statusFilter && v.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return v.person_name?.toLowerCase().includes(q) ||
               v.plate?.toLowerCase().includes(q) ||
               v.brand?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [vehicles, search, statusFilter, isProductora, userCompany]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const fields = [
    { name: 'person_id', label: 'Persona', type: 'searchable-select', required: true, full: true,
      options: people.map((p) => ({ value: p.id, label: p.full_name })) },
    { name: 'brand', label: 'Marca', required: true },
    { name: 'model', label: 'Modelo', required: true },
    { name: 'plate', label: 'Patente', required: true },
    { name: 'color', label: 'Color' },
    { name: 'parking_sector', label: 'Sector de estacionamiento', type: 'select',
      options: sectors.map((s) => ({ value: s.value, label: s.label })) },
    { name: 'event_ids', label: 'Eventos', type: 'toggle-group', full: true,
      options: events.map((e) => ({ value: e.id, label: e.name })) },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS, defaultValue: 'pending' },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true },
  ];

  const handleSubmit = async (data) => {
    const person = people.find((p) => p.id === data.person_id);
    const eventIds = Array.isArray(data.event_ids) ? data.event_ids : [];
    const enriched = {
      ...data,
      person_name: person?.full_name || '',
      company: person?.company || '',
      event_ids: eventIds,
      event_names: eventIds.map((id) => events.find((e) => e.id === id)?.name).filter(Boolean),
    };
    if (editing) await update(editing.id, enriched);
    else await create(enriched);
  };

  const handleExport = () => {
    const headers = ['Persona', 'Marca', 'Modelo', 'Patente', 'Color', 'Sector', 'Estado'];
    const rows = filtered.map((v) => [
      v.person_name, v.brand, v.model, v.plate, v.color,
      sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector,
      v.status,
    ]);
    exportToExcel(headers, rows, 'vehiculos');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Vehículos acreditados">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo vehículo
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por persona, patente o marca…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable loading={loading} isEmpty={filtered.length === 0} error={error} emptyMessage="No hay vehículos cargados.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Persona</Th>
            <Th>Vehículo</Th>
            <Th>Patente</Th>
            <Th>Sector</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((v) => (
            <Tr key={v.id}>
              <Td><p className="font-semibold text-slate-900">{v.person_name}</p></Td>
              <Td className="text-sm text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Car className="h-3.5 w-3.5 text-slate-400" />
                  {v.brand} {v.model}
                </span>
              </Td>
              <Td><span className="font-mono text-xs font-bold text-slate-900">{v.plate}</span></Td>
              <Td className="text-sm text-slate-600">
                {sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '—'}
              </Td>
              <Td><StatusBadge status={v.status} /></Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setPrintVehicle(v)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Imprimir">
                    <Car className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setEditing(v); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Editar">
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
        title={editing ? `${editing.brand} ${editing.model}` : 'Nuevo vehículo'}
        kicker={editing ? 'EDITAR VEHÍCULO' : 'CREAR VEHÍCULO'}
        fields={fields}
        initialData={editing || { status: 'pending' }}
        onSubmit={handleSubmit}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar cambios' : 'Crear vehículo'}
      />

      {printVehicle && (
        <VehicleBadgePrint
          vehicle={printVehicle}
          events={events.filter((e) => printVehicle.event_ids?.includes(e.id))}
          parkingSectors={sectors}
          onClose={() => setPrintVehicle(null)}
        />
      )}
    </div>
  );
}