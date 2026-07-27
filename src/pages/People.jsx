import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import { base44 } from '@/api/base44Client';
import { usePersonTypes } from '@/lib/usePersonTypes';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import PersonDetailModal from '@/components/PersonDetailModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';

const validatePerson = (data) => {
  const e = {};
  if (!data.full_name?.trim()) e.full_name = 'El nombre es obligatorio';
  if (!data.person_type) e.person_type = 'Seleccioná un tipo';
  if (!data.document?.trim()) e.document = 'El documento es obligatorio';
  else if (!/^\d{7,8}$/.test(data.document.trim())) e.document = 'Debe tener 7 u 8 dígitos numéricos';
  if (!data.company?.trim()) e.company = 'La empresa es obligatoria';
  if (!data.phone?.trim()) e.phone = 'El teléfono es obligatorio';
  else if (data.phone.replace(/\D/g, '').length < 12) e.phone = 'Teléfono incompleto (código de área + número)';
  if (!data.email?.trim()) e.email = 'El email es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email inválido';
  if (!data.status) e.status = 'Seleccioná un estado';
  return e;
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'pending', label: 'Pendiente' },
];

export default function People() {
  const { items, loading, create, update, remove } = useCrud('Person');
  const { personTypes } = usePersonTypes();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailPerson, setDetailPerson] = useState(null);
  const [events, setEvents] = useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.list('-start_at', 200);
        setEvents(data);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((p) =>
        `${p.full_name} ${p.company || ''} ${p.document || ''}`.toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter((p) => p.person_type === typeFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    return result;
  }, [items, query, typeFilter, statusFilter]);

  const handleExport = () => {
    exportToExcel(
      ['Nombre', 'Tipo', 'Documento', 'Empresa', 'Teléfono', 'Email', 'Estado', 'Notas'],
      filtered.map((p) => [
        p.full_name || '',
        personTypes.find((t) => t.value === p.person_type)?.label || p.person_type || '',
        p.document || '',
        p.company || '',
        p.phone || '',
        p.email || '',
        p.status || '',
        p.notes || '',
      ]),
      'personas'
    );
  };

  const fields = useMemo(() => {
    const activeEvents = events.filter((e) => {
      if (e.status === 'closed') return false;
      // Exclude events past their end + grace period
      if (e.end_at) {
        const end = new Date(e.end_at);
        const graceMs = (e.grace_hours || 0) * 3600 * 1000;
        if (end.getTime() + graceMs < Date.now()) return false;
      }
      return true;
    });
    // When editing, keep the currently assigned event visible even if expired
    const editingEventId = editing?.event_id;
    if (editingEventId && !activeEvents.find((e) => e.id === editingEventId)) {
      const current = events.find((e) => e.id === editingEventId);
      if (current) activeEvents.push(current);
    }
    return [
      { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, full: true, placeholder: 'Ej: Juan Pérez' },
      {
        name: 'event_id', label: 'Evento', type: 'select', required: true,
        options: activeEvents.map((e) => ({ value: e.id, label: e.name })),
      },
    {
      name: 'person_type', label: 'Tipo', type: 'select', required: true,
      options: personTypes.map((t) => ({ value: t.value, label: t.label })),
    },
    { name: 'document', label: 'Documento', type: 'dni', required: true, placeholder: 'Ej: 12345678' },
    { name: 'company', label: 'Empresa', type: 'text', required: true, placeholder: 'Ej: Producciones S.A.' },
    { name: 'phone', label: 'Teléfono', type: 'phone-ar', required: true, hint: 'Código de área sin 0 y número sin 15. Ej: 11 12345678' },
    { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'Ej: juan@empresa.com' },
    { name: 'status', label: 'Estado', type: 'select', required: true, options: STATUS_OPTIONS },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Responsable de montaje audiovisual' },
      { name: '_face', label: 'Registro facial', type: 'face-capture', full: true },
    ];
  }, [personTypes, events, editing]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (item) => {
    setEditing(item);
    setModalOpen(true);
    try {
      const bios = await base44.entities.Biometric.filter({ person_id: item.id, status: 'active' }, '-created_date', 1);
      if (bios[0]?.face_photo_url) {
        setEditing({ ...item, face_photo_url: bios[0].face_photo_url });
      }
    } catch {}
  };
  const handleSubmit = async (data) => {
    const { face_photo_url, face_descriptor, ...personData } = data;
    let personId;
    if (editing) {
      await update(editing.id, personData);
      personId = editing.id;
    } else {
      const created = await create(personData);
      personId = created.id;
    }
    if (face_photo_url && face_descriptor?.length) {
      const existing = await base44.entities.Biometric.filter({ person_id: personId, status: 'active' });
      for (const b of existing) {
        await base44.entities.Biometric.update(b.id, { status: 'revoked' });
      }
      await base44.entities.Biometric.create({
        person_id: personId,
        person_name: personData.full_name,
        event_id: personData.event_id,
        face_photo_url,
        face_descriptor,
        status: 'active',
      });
    }
  };
  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Directorio" title="Personas">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nueva persona
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, empresa o documento…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} options={personTypes.map((t) => ({ value: t.value, label: t.label }))} placeholder="Todos los tipos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay personas registradas todavía.'}
        tableClassName="min-w-[720px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Persona</Th>
            <Th>Tipo</Th>
            <Th>Empresa</Th>
            <Th>Contacto</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <Tr key={p.id}>
              <Td>
                <button onClick={() => setDetailPerson(p)} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-600">{p.full_name}</button>
                <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
              </Td>
              <Td className="text-sm text-slate-500">{personTypes.find((t) => t.value === p.person_type)?.label || p.person_type}</Td>
              <Td className="text-sm text-slate-500">{p.company || '—'}</Td>
              <Td className="text-sm text-slate-500">{p.phone || p.email || '—'}</Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td className="text-right">
                <button onClick={() => openEdit(p)} className={btnIcon}>
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
        title={editing ? 'Editar persona' : 'Nueva persona'}
        kicker={editing ? 'EDITAR PERSONA' : 'CREAR PERSONA'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        validate={validatePerson}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear persona'}
      />

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} />
      )}
    </div>
  );
}