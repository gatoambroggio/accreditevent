import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download, Trash2, ScanLine } from 'lucide-react';
import DniScannerModal from '@/components/DniScannerModal';
import { exportToExcel } from '@/lib/exportUtils';
import { base44 } from '@/api/base44Client';
import { useZones } from '@/lib/useZones';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import PersonDetailModal from '@/components/PersonDetailModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';

const validatePerson = (data) => {
  const e = {};
  if (!data.full_name?.trim()) e.full_name = 'El nombre es obligatorio';
  if (!data.access_area) e.access_area = 'Seleccioná un área';
  if (!data.document?.trim()) e.document = 'El documento es obligatorio';
  else if (!/^\d{7,8}$/.test(data.document.trim())) e.document = 'Debe tener 7 u 8 dígitos numéricos';
  if (!data.company?.trim()) e.company = 'La empresa es obligatoria';
  if (data.phone?.trim() && data.phone.replace(/\D/g, '').length < 12) e.phone = 'Teléfono incompleto (código de área + número)';
  if (data.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email inválido';
  if (!data.status) e.status = 'Seleccioná un estado';
  return e;
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'pending', label: 'Pendiente' },
];

export default function People() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Person');
  const { zones } = useZones();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [detailPerson, setDetailPerson] = useState(null);
  const [dniScannerOpen, setDniScannerOpen] = useState(false);
  const [dniPrefill, setDniPrefill] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [events, setEvents] = useState([]);
  const [companies, setCompanies] = useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const [evs, comps] = await Promise.all([
          base44.entities.Event.list('-start_at', 200),
          base44.entities.ProviderCompany.list('name', 500),
        ]);
        setEvents(evs);
        setCompanies(comps);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = items.filter((p) => p.tipo_vinculo !== 'autonomo');
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((p) =>
        `${p.full_name} ${p.company || ''} ${p.document || ''}`.toLowerCase().includes(q)
      );
    }
    if (areaFilter) result = result.filter((p) => p.access_area === areaFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (companyFilter) result = result.filter((p) => p.company === companyFilter);
    return result;
  }, [items, query, areaFilter, statusFilter, companyFilter]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const allFilteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} persona(s)? Esta acción no se puede deshacer.`)) return;
    for (const id of selected) {
      try { await base44.functions.invoke('deletePerson', { person_id: id }); } catch {}
    }
    setSelected(new Set());
    await reload();
  };
  const handleExportSelected = () => {
    exportToExcel(
      ['Nombre', 'Área', 'Documento', 'Empresa', 'Teléfono', 'Email', 'Estado', 'Notas'],
      filtered.filter((p) => selected.has(p.id)).map((p) => [
        p.full_name || '',
        zones.find((z) => z.value === p.access_area)?.label || p.access_area || '',
        p.document || '',
        p.company || '',
        p.phone || '',
        p.email || '',
        p.status || '',
        p.notes || '',
      ]),
      'personas_seleccionadas'
    );
  };

  const handleExport = () => {
    exportToExcel(
      ['Nombre', 'Área', 'Documento', 'Empresa', 'Teléfono', 'Email', 'Estado', 'Notas'],
      filtered.map((p) => [
        p.full_name || '',
        zones.find((z) => z.value === p.access_area)?.label || p.access_area || '',
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
        name: 'event_phases', label: 'Fases del evento', type: 'toggle-group',
        options: [
          { value: 'armado', label: 'Armado' },
          { value: 'dia_evento', label: 'Show' },
          { value: 'desarme', label: 'Desarme' },
        ],
        full: true,
      },
    {
      name: 'access_area', label: 'Tipo / Área de acceso', type: 'select', required: true,
      options: zones.map((z) => ({ value: z.value, label: z.label })),
    },
    { name: 'document', label: 'Documento', type: 'dni', required: true, placeholder: 'Ej: 12345678' },
    {
      name: 'company', label: 'Empresa', type: 'searchable-select', required: true, allowCreate: true,
      options: companies.map((c) => ({ value: c.name, label: c.name })),
      placeholder: 'Buscar o crear empresa…',
    },
    { name: 'phone', label: 'Teléfono (opcional)', type: 'phone-ar', hint: 'Código de área sin 0 y número sin 15. Ej: 11 12345678' },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'Ej: juan@empresa.com' },
    { name: 'status', label: 'Estado', type: 'select', required: true, options: STATUS_OPTIONS },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Responsable de montaje audiovisual' },
      { name: '_face', label: 'Registro facial', type: 'face-capture', full: true },
    ];
  }, [zones, events, editing, companies]);

  const openNew = () => { setEditing(null); setDniPrefill(null); setModalOpen(true); };
  const openEdit = async (item) => {
    setDniPrefill(null);
    const normalized = { ...item };
    if (!normalized.event_id && normalized.event_ids?.length) {
      normalized.event_id = normalized.event_ids[0];
    }
    if (Array.isArray(normalized.event_phases)) {
      normalized.event_phases = normalized.event_phases.join(',');
    }
    setEditing(normalized);
    setModalOpen(true);
    try {
      const bios = await base44.entities.Biometric.filter({ person_id: item.id, status: 'active' }, '-created_date', 1);
      if (bios[0]?.face_photo_url) {
        setEditing({ ...normalized, face_photo_url: bios[0].face_photo_url });
      }
    } catch {}
  };
  const handleDniScanned = (data) => {
    setEditing(null);
    setDniPrefill({
      full_name: `${data.nombre} ${data.apellido}`.trim(),
      document: data.dni,
      face_photo_url: data.faceUrl,
      face_descriptor: data.faceDescriptor,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (data) => {
    const { face_photo_url, face_descriptor, ...personData } = data;
    personData.person_type = personData.access_area || 'general';
    personData.tipo_vinculo = 'empresa';
    // Create ProviderCompany if it doesn't exist
    if (personData.company && !companies.find((c) => c.name === personData.company)) {
      try { await base44.entities.ProviderCompany.create({ name: personData.company }); } catch {}
    }
    if (typeof personData.event_phases === 'string') {
      personData.event_phases = personData.event_phases.split(',').map((s) => s.trim()).filter(Boolean);
    }
    // Set productora from current user's company for RLS
    let userCompany = '';
    try {
      const me = await base44.auth.me();
      userCompany = me?.company || me?.data?.company || '';
      if (!personData.productora) personData.productora = userCompany;
    } catch {}
    // SECURITY: Check DNI + email duplicate BEFORE creating/updating person
    const docCheck = await base44.functions.invoke('checkDocumentDuplicate', {
      document: personData.document || null,
      email: personData.email || null,
      person_id: editing?.id || null,
    });
    if (docCheck.data?.is_duplicate) {
      const field = docCheck.data.duplicate_type === 'email' ? 'email' : 'DNI';
      throw new Error(`Ya existe una persona con ese ${field}: ${docCheck.data.existing_person.full_name} (${docCheck.data.existing_person.company || 'sin empresa'}). No pueden haber dos personas con el mismo ${field}.`);
    }
    // SECURITY: Check face duplicate BEFORE creating/updating person
    if (face_photo_url && face_descriptor?.length) {
      const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
        face_descriptor,
        person_id: editing?.id || null,
      });
      if (dupCheck.data?.is_duplicate) {
        throw new Error(`Este rostro ya está registrado para "${dupCheck.data.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
      }
    }
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
      if (existing.length > 0) {
        await base44.entities.Biometric.updateMany(
          { person_id: personId, status: 'active' },
          { $set: { status: 'revoked' } }
        );
      }
      const evt = events.find((e) => e.id === personData.event_id);
      await base44.entities.Biometric.create({
        person_id: personId,
        person_name: personData.full_name,
        event_id: personData.event_id,
        company: evt?.company || userCompany || personData.productora || '',
        face_photo_url,
        face_descriptor,
        status: 'active',
      });
    }
    // Sync phases to active accreditations
    try {
      const accreditations = await base44.entities.Accreditation.filter({ person_id: personId, status: 'active' });
      for (const acc of accreditations) {
        await base44.entities.Accreditation.update(acc.id, {
          event_phases: personData.event_phases,
          area: personData.access_area || acc.area,
          access_level: personData.access_area || acc.access_level,
          person_type: personData.access_area || acc.person_type,
        });
      }
    } catch {}
  };
  const handleDelete = async () => {
    await base44.functions.invoke('deletePerson', { person_id: editing.id });
    await reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Directorio" title="Empleados">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={() => setDniScannerOpen(true)} className={btnOutline}>
          <ScanLine className="h-4 w-4" /> Escanear DNI
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo empleado
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, empresa o documento…" />
        <FilterSelect value={areaFilter} onChange={setAreaFilter} options={zones.map((z) => ({ value: z.value, label: z.label }))} placeholder="Todas las áreas" />
        <FilterSelect value={companyFilter} onChange={setCompanyFilter} options={companies.map((c) => ({ value: c.name, label: c.name }))} placeholder="Todas las empresas" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-emerald-700">{selected.size} seleccionada(s)</span>
          <button onClick={handleExportSelected} className={btnOutline}>
            <Download className="h-4 w-4" /> Exportar selección
          </button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">
            <Trash2 className="h-4 w-4" /> Eliminar selección
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
        </div>
      )}

      <DataTable
        loading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay empleados registrados todavía.'}
        tableClassName="min-w-[800px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th className="w-10">
              <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            </Th>
            <Th>Persona</Th>
            <Th>Tipo / Área</Th>
            <Th>Empresa</Th>
            <Th>Contacto</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((p) => (
            <Tr key={p.id}>
              <Td className="w-10">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              </Td>
              <Td>
                <button onClick={() => setDetailPerson(p)} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-600">{p.full_name}</button>
                <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
              </Td>
              <Td>
                {p.access_area ? (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{zones.find((z) => z.value === p.access_area)?.label || p.access_area}</span>
                ) : <span className="text-sm text-slate-400">—</span>}
              </Td>
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

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDniPrefill(null); }}
        title={editing ? 'Editar empleado' : 'Nuevo empleado'}
        kicker={editing ? 'EDITAR EMPLEADO' : 'CREAR EMPLEADO'}
        fields={fields}
        initialData={editing || dniPrefill || {}}
        onSubmit={handleSubmit}
        validate={validatePerson}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear empleado'}
        entityName="Person"
      />

      <DniScannerModal open={dniScannerOpen} onClose={() => setDniScannerOpen(false)} onScanned={handleDniScanned} />

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} />
      )}
    </div>
  );
}