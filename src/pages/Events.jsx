import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'closed', label: 'Cerrado' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Events() {
  const { items, loading, create, update, remove } = useCrud('Event');
  const { user: currentUser } = useAuth();
  const isProductora = currentUser?.role === 'productora';
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [userData, companyData] = await Promise.all([
          base44.entities.User.list('-created_date', 200),
          base44.entities.Company.list('-created_date', 200),
        ]);
        setUsers(userData.filter((u) => u.role !== 'provider' && u.role !== 'superadmin'));
        setCompanies(companyData);
      } catch {}
    })();
  }, []);

  const fields = useMemo(() => {
    const baseFields = [
      { name: 'name', label: 'Nombre del evento', type: 'text', required: true, full: true },
      { name: 'venue', label: 'Sede', type: 'text' },
      { name: 'logo_url', label: 'Logo del evento', type: 'image-upload', full: true },
    ];
    if (!isProductora) {
      baseFields.push({
        name: 'company', label: 'Empresa', type: 'select', full: true,
        options: companies.map((c) => ({ value: c.name, label: c.name })),
        hint: 'Los usuarios con rol productora de esta empresa verán automáticamente este evento',
      });
    }
    baseFields.push(
      { name: 'start_at', label: 'Inicio', type: 'datetime-local' },
      { name: 'end_at', label: 'Fin', type: 'datetime-local' },
      { name: 'grace_hours', label: 'Horas extra post-evento', type: 'number' },
      { name: 'pickup_date', label: 'Fecha de retiro', type: 'date' },
      { name: 'pickup_start_time', label: 'Retiro desde', type: 'time' },
      { name: 'pickup_end_time', label: 'Retiro hasta', type: 'time' },
      { name: 'pickup_address', label: 'Dirección de retiro', type: 'address', full: true, placeholder: 'Buscar dirección…' },
      {
        name: 'assigned_user_ids', label: 'Usuarios asignados', type: 'toggle-group', full: true,
        options: users.map((u) => ({ value: u.id, label: u.full_name || u.email })),
      },
      { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS },
    );
    return baseFields;
  }, [users, companies, isProductora]);

  const filtered = useMemo(() => {
    let result = items;
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((e) =>
        `${e.name} ${e.venue || ''}`.toLowerCase().includes(q)
      );
    }
    if (statusFilter) result = result.filter((e) => e.status === statusFilter);
    return result;
  }, [items, query, statusFilter]);

  const handleExport = () => {
    exportToExcel(
      ['Evento', 'Sede', 'Inicio', 'Fin', 'Estado', 'Retiro'],
      filtered.map((e) => [
        e.name || '',
        e.venue || '',
        e.start_at ? new Date(e.start_at).toLocaleString('es-AR') : '',
        e.end_at ? new Date(e.end_at).toLocaleString('es-AR') : '',
        e.status || '',
        e.pickup_address || '',
      ]),
      'eventos'
    );
  };

  const openNew = () => { setEditing(isProductora ? { company: currentUser.company } : null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const syncUserEvents = async (eventId, newAssignedIds) => {
    const prevIds = editing?.assigned_user_ids || [];
    const added = newAssignedIds.filter((id) => !prevIds.includes(id));
    const removed = prevIds.filter((id) => !newAssignedIds.includes(id));
    for (const uid of [...added, ...removed]) {
      const u = users.find((x) => x.id === uid);
      if (!u) continue;
      let eventIds = u.assigned_event_ids || [];
      if (added.includes(uid)) {
        if (!eventIds.includes(eventId)) eventIds = [...eventIds, eventId];
      } else {
        eventIds = eventIds.filter((eid) => eid !== eventId);
      }
      try {
        await base44.entities.User.update(uid, { assigned_event_ids: eventIds });
      } catch {}
    }
  };

  const handleSubmit = async (data) => {
    if (data.pickup_address && (!data.pickup_lat || !data.pickup_lng)) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(data.pickup_address)}&limit=1&countrycodes=ar`
        );
        const results = await res.json();
        if (results[0]) {
          data.pickup_lat = parseFloat(results[0].lat);
          data.pickup_lng = parseFloat(results[0].lon);
        }
      } catch {}
    }
    if (isProductora) {
      data.company = currentUser.company;
    }
    const assignedIds = data.assigned_user_ids
      ? String(data.assigned_user_ids).split(',').filter(Boolean)
      : [];
    if (data.company) {
      const companyProductoras = users.filter((u) => u.role === 'productora' && u.company === data.company);
      for (const pu of companyProductoras) {
        if (!assignedIds.includes(pu.id)) assignedIds.push(pu.id);
      }
    }
    const payload = { ...data, assigned_user_ids: assignedIds };
    let eventId;
    if (editing?.id) {
      await update(editing.id, payload);
      eventId = editing.id;
    } else {
      const created = await create(payload);
      eventId = created.id;
    }
    await syncUserEvents(eventId, assignedIds);
    await logAudit(editing ? 'update' : 'create', 'Event', eventId, `Usuarios: ${assignedIds.length}`);
  };

  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Eventos">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo evento
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o sede…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage={query || statusFilter ? 'Sin resultados para tu búsqueda.' : 'No hay eventos registrados. Creá el primero.'}
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Evento</Th>
            <Th>Empresa</Th>
            <Th>Sede</Th>
            <Th>Fechas</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <Tr key={e.id}>
              <Td className="text-sm font-semibold text-slate-900">{e.name}</Td>
              <Td className="text-sm text-slate-500">{e.company || '—'}</Td>
              <Td className="text-sm text-slate-500">{e.venue || '—'}</Td>
              <Td className="text-sm text-slate-500">
                {fmtDate(e.start_at)}{e.end_at ? ` — ${fmtDate(e.end_at)}` : ''}
              </Td>
              <Td><StatusBadge status={e.status} /></Td>
              <Td className="text-right">
                <button onClick={() => openEdit(e)} className={btnIcon}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar evento' : 'Nuevo evento'}
        kicker={editing ? 'EDITAR EVENTO' : 'CREAR EVENTO'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing?.id ? handleDelete : null}
        canDelete={!!editing?.id}
        submitLabel={editing ? 'Guardar cambios' : 'Crear evento'}
      />
    </div>
  );
}