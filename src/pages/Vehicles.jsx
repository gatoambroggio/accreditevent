import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download, Car, Printer, Check, X } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import VehicleBadgePrint from '@/components/VehicleBadgePrint';
import BatchVehicleBadgePrint from '@/components/BatchVehicleBadgePrint';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { useAuth } from '@/lib/AuthContext';
import { canManage } from '@/lib/accessUtils';
import { base44 } from '@/api/base44Client';
import { computeSectorOccupancy, sectorStatus } from '@/lib/parkingCapacity';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIconSm } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';

const VEHICLE_STATUS_OPTIONS = [
  { value: 'approved', label: 'Aprobado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'rejected', label: 'Rechazado' },
];

const VEHICLE_TYPE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'moto', label: 'Moto' },
  { value: 'camioneta', label: 'Camioneta' },
  { value: 'camion', label: 'Camión' },
];

const VEHICLE_TYPE_LABELS = {
  auto: 'Auto',
  moto: 'Moto',
  camioneta: 'Camioneta',
  camion: 'Camión',
};

const VEHICLE_STATUS_LABELS = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
};

const validateVehicle = (data) => {
  const e = {};
  if (!data.person_id) e.person_id = 'Seleccioná una persona';
  if (!data.brand?.trim()) e.brand = 'La marca es obligatoria';
  if (!data.model?.trim()) e.model = 'El modelo es obligatorio';
  if (!data.plate?.trim()) e.plate = 'La patente es obligatoria';
  return e;
};

export default function Vehicles() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Vehicle');
  const { user: currentUser } = useAuth();
  const isProductora = currentUser?.role === 'productora';
  const canManageRecords = canManage(currentUser);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [people, setPeople] = useState([]);
  const [printingVehicle, setPrintingVehicle] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [events, setEvents] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const { sectors } = useParkingSectors();

  const [peopleLoaded, setPeopleLoaded] = useState(false);

  const isEventExpired = (e) => {
    if (e.status === 'closed') return true;
    if (!e.end_at) return false;
    const grace = e.grace_hours || 0;
    return Date.now() > new Date(e.end_at).getTime() + grace * 3600000;
  };

  const activeEventIds = useMemo(() => new Set(events.filter((e) => !isEventExpired(e)).map((e) => e.id)), [events]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return items.filter((v) => {
      if (isProductora) {
        const userCompany = currentUser?.company || currentUser?.data?.company;
        if (!userCompany) return false;
        // El vehicle.company es la empresa proveedora, no la productora.
        // La productora ve vehículos vinculados a sus eventos o creados por ella.
        const myEventIds = new Set(events.filter((e) => e.company === userCompany).map((e) => e.id));
        const vehEventIds = Array.isArray(v.event_ids) ? v.event_ids : [];
        const linkedToMyEvents = vehEventIds.some((id) => myEventIds.has(id));
        if (v.company !== userCompany && !linkedToMyEvents) return false;
      }
      if (statusFilter && v.status !== statusFilter) return false;
      if (eventFilter) {
        const evIds = Array.isArray(v.event_ids) ? v.event_ids : [];
        if (!evIds.includes(eventFilter)) return false;
      }
      if (!q) {
        if (v.status === 'approved') return true;
        return false;
      }
      const person = people.find((p) => p.id === v.person_id);
      const personDoc = person?.document || '';
      return `${v.person_name || ''} ${v.brand || ''} ${v.model || ''} ${v.plate || ''} ${personDoc}`.toLowerCase().includes(q);
    });
  }, [items, events, activeEventIds, isProductora, currentUser, query, statusFilter, eventFilter, people]);

  const capacityEvent = useMemo(() => events.find((e) => e.id === eventFilter) || null, [events, eventFilter]);
  const occupancy = useMemo(() => computeSectorOccupancy(items, eventFilter || null), [items, eventFilter]);

  const printingAccredId = useMemo(() => {
    if (!printingVehicle) return null;
    const evIds = Array.isArray(printingVehicle.event_ids) ? printingVehicle.event_ids : [];
    const acc = accreditations.find((a) => a.person_id === printingVehicle.person_id && evIds.includes(a.event_id));
    return acc?.id || null;
  }, [printingVehicle, accreditations]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleStatusChange = async (vehicle, newStatus) => {
    try {
      await base44.entities.Vehicle.update(vehicle.id, { status: newStatus });
      // Update local state via reload from useCrud
      await reload();
    } catch {}
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((v) => v.id));
    });
  };

  const handleBatchPrint = () => {
    if (selected.size === 0) return;
    setBatchOpen(true);
  };

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Marca', 'Modelo', 'Patente', 'Color', 'Eventos', 'Estacionamiento', 'Estado', 'Notas'],
      filtered.map((v) => [
        v.person_name || '',
        VEHICLE_TYPE_LABELS[v.vehicle_type] || 'Auto',
        v.brand || '',
        v.model || '',
        v.plate || '',
        v.color || '',
        (v.event_names || []).join(', '),
        sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '',
        VEHICLE_STATUS_LABELS[v.status] || 'Pendiente',
        v.notes || '',
      ]),
      'vehiculos'
    );
  };

  const loadPeople = async () => {
    if (peopleLoaded) return;
    try {
      const all = await base44.entities.Person.list('-created_date', 500);
      setPeople(all);
      setPeopleLoaded(true);
    } catch {}
  };

  React.useEffect(() => {
    (async () => {
      try {
        const [all, evs, accs] = await Promise.all([
          base44.entities.SystemSetting.list('-created_date', 1),
          base44.entities.Event.list('-start_at', 200),
          base44.entities.Accreditation.list('-created_date', 5000),
        ]);
        if (all[0]) setSettings(all[0]);
        setEvents(evs);
        setAccreditations(accs);
      } catch {}
    })();
    loadPeople();
  }, []);

  const openPrint = (vehicle) => setPrintingVehicle(vehicle);

  const openNew = () => {
    setEditing(null);
    loadPeople();
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    loadPeople();
    setModalOpen(true);
  };

  const handleSubmit = async (data) => {
    const person = people.find((p) => p.id === data.person_id);
    const selectedEventIds = data.event_ids ? String(data.event_ids).split(',').filter(Boolean) : [];
    const enriched = {
      ...data,
      vehicle_type: data.vehicle_type || 'auto',
      status: data.status || (editing ? 'pending' : 'approved'),
      person_name: person?.full_name || editing?.person_name || '',
      company: events.find((e) => e.id === selectedEventIds[0])?.company || editing?.company || '',
      plate: (data.plate || '').toUpperCase().trim(),
      event_ids: selectedEventIds,
      event_names: selectedEventIds.map((id) => events.find((e) => e.id === id)?.name).filter(Boolean),
    };
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  const fields = useMemo(() => [
    {
      name: 'person_id', label: 'Persona', type: 'searchable-select', required: true,
      options: people.map((p) => ({ value: p.id, label: `${p.full_name} · DNI ${p.document || '—'} · ${p.company || 'Sin empresa'}` })),
      placeholder: 'Buscar por nombre, DNI o empresa…',
    },
    { name: 'vehicle_type', label: 'Tipo de vehículo', type: 'select', options: VEHICLE_TYPE_OPTIONS, required: true, defaultValue: 'auto' },
    { name: 'brand', label: 'Marca', type: 'text', required: true, placeholder: 'Ej: Ford' },
    { name: 'model', label: 'Modelo', type: 'text', required: true, placeholder: 'Ej: Fiesta' },
    { name: 'plate', label: 'Patente', type: 'text', required: true, placeholder: 'Ej: AB123CD', hint: 'Se guardará en mayúsculas.' },
    { name: 'color', label: 'Color', type: 'text', placeholder: 'Ej: Blanco' },
    {
      name: 'event_ids', label: 'Eventos asignados', type: 'toggle-group',
      options: events.filter((e) => !isEventExpired(e)).map((e) => ({ value: e.id, label: e.name })),
      full: true,
    },
    {
      name: 'parking_sector', label: 'Sector de estacionamiento', type: 'select',
      options: sectors.map((s) => ({ value: s.value, label: s.label })),
      placeholder: 'Seleccionar sector…',
    },
    {
      name: 'status', label: 'Estado de autorización', type: 'select',
      options: VEHICLE_STATUS_OPTIONS,
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Vehículo de carga' },
  ], [people, sectors, events]);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Logística" title="Acreditar vehículos">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={handleBatchPrint} disabled={selected.size === 0}
          className={`${btnOutline} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <Printer className="h-4 w-4" /> Imprimir ({selected.size})
        </button>
        {canManageRecords && (
          <button onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Acreditar vehículo
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por patente, persona, marca…" />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={VEHICLE_STATUS_OPTIONS}
          placeholder="Todos los estados"
        />
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Todos los eventos"
        />
      </div>

      {capacityEvent && sectors.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Capacidad de estacionamiento — {capacityEvent.name}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sectors.map((s) => {
              const st = sectorStatus(capacityEvent, s.value, occupancy);
              return (
                <div key={s.id} className={`rounded-lg border p-3 ${st.full ? 'border-red-200 bg-red-50' : st.cap ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {st.cap ? (
                      <span className={`text-sm font-bold ${st.full ? 'text-red-600' : 'text-emerald-700'}`}>{st.label}</span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin límite</span>
                    )}
                    {st.full && (
                      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Agotado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">Podés seguir acreditando vehículos aunque un sector esté agotado.</p>
        </div>
      )}

      <DataTable
        loading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyIcon={Car}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay vehículos acreditados.'}
        tableClassName="min-w-[820px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </Th>
            <Th>Persona</Th>
            <Th>Tipo</Th>
            <Th>Vehículo</Th>
            <Th>Patente</Th>
            <Th>Eventos</Th>
            <Th>Estacionamiento</Th>
            <Th>Color</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((v) => (
            <Tr key={v.id}>
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggleSelect(v.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </Td>
              <Td className="text-sm font-semibold text-slate-900">{v.person_name || '—'}</Td>
              <Td>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {VEHICLE_TYPE_LABELS[v.vehicle_type] || 'Auto'}
                </span>
              </Td>
              <Td className="text-sm text-slate-600">{v.brand} {v.model}</Td>
              <Td>
                <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-slate-700">
                  {v.plate}
                </span>
              </Td>
              <Td className="text-sm text-slate-600">
                {v.event_names?.length ? v.event_names.join(', ') : '—'}
              </Td>
              <Td className="text-sm text-slate-600">
                {sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '—'}
              </Td>
              <Td className="text-sm text-slate-500">{v.color || '—'}</Td>
              <Td>
                <StatusBadge status={v.status || 'pending'} />
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {v.status !== 'approved' && (
                    <button onClick={() => handleStatusChange(v, 'approved')} className={btnIconSm} title="Aprobar vehículo" style={{ color: '#059669' }}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {v.status !== 'rejected' && (
                    <button onClick={() => handleStatusChange(v, 'rejected')} className={btnIconSm} title="Rechazar vehículo" style={{ color: '#dc2626' }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => openPrint(v)} className={btnIconSm} title="Imprimir credencial">
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  {canManageRecords && (
                    <button onClick={() => openEdit(v)} className={btnIconSm}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar vehículo' : 'Nuevo vehículo'}
        kicker={editing ? 'EDITAR VEHÍCULO' : 'CREAR VEHÍCULO'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        validate={validateVehicle}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing && canManageRecords}
        submitLabel={editing ? 'Guardar cambios' : 'Crear vehículo'}
        entityName="Vehicle"
      />

      {printingVehicle && (
        <VehicleBadgePrint
          vehicle={printingVehicle}
          settings={settings}
          events={events.filter((e) => printingVehicle.event_ids?.includes(e.id))}
          parkingSectors={sectors}
          accreditationId={printingAccredId}
          onClose={() => setPrintingVehicle(null)}
        />
      )}

      {batchOpen && (
        <BatchVehicleBadgePrint
          vehicles={filtered.filter((v) => selected.has(v.id))}
          settings={settings}
          events={events}
          sectors={sectors}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </div>
  );
}