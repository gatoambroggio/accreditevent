import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Download, Share2, MapPin, Pencil } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import ShareLinkModal from '@/components/ShareLinkModal';
import { useCrud } from '@/lib/crud';
import { usePagination } from '@/lib/usePagination';
import { formatDateTime } from '@/lib/formatDate';
import { exportToExcel } from '@/lib/exportUtils';
import { getEventStatus, EVENT_STATUS_INFO } from '@/lib/accessUtils';
import { getUserCompany } from '@/lib/userCompany';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'closed', label: 'Cerrado' },
];

export default function Events() {
  const { user } = useAuth();
  const { items: events, loading, error, create, update, remove } = useCrud('Event');
  const [companies, setCompanies] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [shareEvent, setShareEvent] = useState(null);

  useEffect(() => {
    base44.entities.Company.list('-created_date', 100).then(setCompanies).catch(() => {});
  }, []);

  const userCompany = getUserCompany(user);
  const isProductora = user?.role === 'productora';

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (isProductora && ev.company !== userCompany) return false;
      if (statusFilter && ev.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return ev.name?.toLowerCase().includes(q) || ev.venue?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [events, search, statusFilter, isProductora, userCompany]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 12);

  const fields = useMemo(() => [
    { name: 'name', label: 'Nombre del evento', required: true, full: true },
    { name: 'venue', label: 'Sede / Lugar', full: true },
    {
      name: 'company', label: 'Empresa productora', type: 'select',
      options: companies.map((c) => ({ value: c.name, label: c.name })),
      defaultValue: userCompany,
      disabled: isProductora,
    },
    { name: 'logo_url', label: 'Logo del evento', type: 'image-upload', full: true },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS, defaultValue: 'draft' },
    { name: 'grace_hours', label: 'Horas de gracia', type: 'number', defaultValue: 4 },
    { name: 'armado_start', label: 'Armado — inicio', type: 'datetime-local' },
    { name: 'armado_end', label: 'Armado — fin', type: 'datetime-local' },
    { name: 'start_at', label: 'Show — inicio', type: 'datetime-local' },
    { name: 'end_at', label: 'Show — fin', type: 'datetime-local' },
    { name: 'desarme_start', label: 'Desarme — inicio', type: 'datetime-local' },
    { name: 'desarme_end', label: 'Desarme — fin', type: 'datetime-local' },
    { name: 'pickup_date', label: 'Fecha de retiro de credenciales', type: 'date' },
    { name: 'pickup_start_time', label: 'Hora inicio retiro' },
    { name: 'pickup_end_time', label: 'Hora fin retiro' },
    { name: 'pickup_address', label: 'Dirección de retiro', type: 'address', full: true },
  ], [companies, userCompany, isProductora]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (ev) => { setEditing(ev); setModalOpen(true); };

  const handleSubmit = async (data) => {
    if (editing) {
      await update(editing.id, data);
    } else {
      await create(data);
    }
  };

  const handleExport = () => {
    const headers = ['Nombre', 'Sede', 'Empresa', 'Inicio', 'Fin', 'Estado'];
    const rows = filtered.map((ev) => [
      ev.name, ev.venue, ev.company,
      ev.start_at ? formatDateTime(ev.start_at) : '',
      ev.end_at ? formatDateTime(ev.end_at) : '',
      ev.status,
    ]);
    exportToExcel(headers, rows, 'eventos');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Eventos">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo evento
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o sede…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable loading={loading} isEmpty={filtered.length === 0} error={error} emptyMessage="No hay eventos cargados.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Evento</Th>
            <Th>Empresa</Th>
            <Th>Show</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((ev) => {
            const status = getEventStatus(ev);
            const info = EVENT_STATUS_INFO[status];
            return (
              <Tr key={ev.id}>
                <Td>
                  <p className="font-semibold text-slate-900">{ev.name}</p>
                  {ev.venue && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" /> {ev.venue}
                    </p>
                  )}
                </Td>
                <Td><span className="text-sm text-slate-600">{ev.company || '—'}</span></Td>
                <Td className="text-sm text-slate-600">
                  {ev.start_at ? formatDateTime(ev.start_at) : 'Sin fecha'}
                </Td>
                <Td>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${info.cls}`}>
                    {info.label}
                  </span>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setShareEvent(ev)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Compartir registro">
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => openEdit(ev)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={12} />}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.name : 'Nuevo evento'}
        kicker={editing ? 'EDITAR EVENTO' : 'CREAR EVENTO'}
        fields={fields}
        initialData={editing || { status: 'draft', grace_hours: 4, company: userCompany }}
        onSubmit={handleSubmit}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar cambios' : 'Crear evento'}
      />

      {shareEvent && (
        <ShareLinkModal event={shareEvent} onClose={() => setShareEvent(null)} />
      )}
    </div>
  );
}