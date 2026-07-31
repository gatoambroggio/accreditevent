import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download, Trash2, ScanLine, FileSpreadsheet, FileText, ShieldCheck, ShieldAlert } from 'lucide-react';
import DniScannerModal from '@/components/DniScannerModal';
import { exportToExcel } from '@/lib/exportUtils';
import { base44 } from '@/api/base44Client';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import PersonDetailModal from '@/components/PersonDetailModal';
import AdminEmployeeImportModal from '@/components/AdminEmployeeImportModal';
import PersonDocUploadModal from '@/components/PersonDocUploadModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { getInsuranceCoverageMap, isPersonInsured, isPersonInsurancePending } from '@/lib/insuranceUtils';
import { buildPhaseOptions, getShowDays } from '@/lib/eventPhases';
import { useAuth } from '@/lib/AuthContext';
import { canManage } from '@/lib/accessUtils';

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
  if (data._veh_plate?.trim() && (!data._veh_brand?.trim() || !data._veh_model?.trim())) e._veh_plate = 'Si cargás una patente, debés completar marca y modelo';
  return e;
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'pending', label: 'Pendiente' },
];

const BLOOD_TYPE_OPTIONS = [
  { value: '', label: 'Sin especificar' },
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
];

const INSURANCE_OPTIONS = [
  { value: 'insured', label: 'Asegurados' },
  { value: 'pending', label: 'En revisión' },
  { value: 'uninsured', label: 'Sin seguro' },
];

export default function People() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Person');
  const { zones } = useZones();
  const { sectors } = useParkingSectors();
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
  const [importOpen, setImportOpen] = useState(false);
  const [docUploadPerson, setDocUploadPerson] = useState(null);
  const [coverageMap, setCoverageMap] = useState({});
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const { user } = useAuth();
  const canManageRecords = canManage(user);

  React.useEffect(() => {
    (async () => {
      try {
        const [evs, comps, covMap] = await Promise.all([
          base44.entities.Event.list('-start_at', 200),
          base44.entities.ProviderCompany.list('name', 500),
          getInsuranceCoverageMap(),
        ]);
        setEvents(evs);
        setCompanies(comps);
        setCoverageMap(covMap);
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
    if (insuranceFilter === 'insured') result = result.filter((p) => isPersonInsured(p, coverageMap));
    if (insuranceFilter === 'pending') result = result.filter((p) => isPersonInsurancePending(p, coverageMap));
    if (insuranceFilter === 'uninsured') result = result.filter((p) => !isPersonInsured(p, coverageMap) && !isPersonInsurancePending(p, coverageMap));
    return result;
  }, [items, query, areaFilter, statusFilter, companyFilter, insuranceFilter, coverageMap]);

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

  const handleImport = async (rows, companyName, eventId) => {
    const ev = events.find((e) => e.id === eventId);
    const enrichedRows = rows.map((r) => ({
      ...r,
      company: companyName,
      event_ids: eventId ? [eventId] : [],
      event_names: eventId ? [ev?.name] : [],
      productora: ev?.company || '',
    }));
    await base44.entities.Person.bulkCreate(enrichedRows);
    await reload();
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
        name: 'event_phases', label: 'Días / Fases del evento', type: 'toggle-group',
        options: buildPhaseOptions(getShowDays(events, selectedEventId || editing?.event_id || '')),
        hint: 'Seleccioná los días de show y fases (armado/desarme) en los que participa.',
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
      { name: '_veh_plate', label: 'Vehículo — Patente', type: 'text', full: true, placeholder: 'Ej: AB123CD', hint: 'Completá estos datos si la persona necesita acceso vehicular al evento.' },
      { name: '_veh_brand', label: 'Vehículo — Marca', type: 'text', placeholder: 'Ej: Toyota' },
      { name: '_veh_model', label: 'Vehículo — Modelo', type: 'text', placeholder: 'Ej: Corolla' },
      { name: '_veh_color', label: 'Vehículo — Color', type: 'text', placeholder: 'Ej: Blanco' },
      { name: '_veh_parking_sector', label: 'Vehículo — Sector', type: 'select', options: sectors.map((s) => ({ value: s.value, label: s.label })) },
      { name: '_section_emergencia', label: 'Datos para emergencia médica', type: 'section', full: true, hint: 'Estos datos son opcionales y se utilizan solo en caso de emergencia.' },
      { name: 'blood_type', label: 'Grupo sanguíneo', type: 'select', options: BLOOD_TYPE_OPTIONS },
      { name: 'allergies', label: 'Alergias a medicamentos', type: 'textarea', full: true, placeholder: 'Ej: Penicilina, aspirina…' },
      { name: 'obra_social', label: 'Obra social', type: 'text', placeholder: 'Ej: OSDE' },
      { name: 'carnet_obra_social', label: 'N° carnet obra social', type: 'text', placeholder: 'Ej: 123456789' },
      { name: 'emergency_contact_name', label: 'Contacto de emergencia — Nombre', type: 'text', placeholder: 'Ej: María Pérez' },
      { name: 'emergency_contact_phone', label: 'Contacto de emergencia — Teléfono', type: 'phone-ar' },
      { name: 'coordinator_name', label: 'Coordinador asignado', type: 'text', placeholder: 'Ej: Carlos López' },
    ];
  }, [zones, events, editing, companies, sectors, selectedEventId]);

  const openNew = () => { setEditing(null); setDniPrefill(null); setSelectedEventId(''); setModalOpen(true); };
  const openEdit = async (item) => {
    setDniPrefill(null);
    const normalized = { ...item };
    if (!normalized.event_id && normalized.event_ids?.length) {
      normalized.event_id = normalized.event_ids[0];
    }
    setSelectedEventId(normalized.event_id || '');
    if (Array.isArray(normalized.event_phases)) {
      normalized.event_phases = normalized.event_phases.join(',');
    }
    setEditing(normalized);
    setModalOpen(true);
    try {
      const [bios, vehs] = await Promise.all([
        base44.entities.Biometric.filter({ person_id: item.id, status: 'active' }, '-created_date', 1),
        base44.entities.Vehicle.filter({ person_id: item.id }, '-created_date', 1),
      ]);
      const extra = {};
      if (bios[0]?.face_photo_url) extra.face_photo_url = bios[0].face_photo_url;
      if (vehs[0]) {
        extra._veh_id = vehs[0].id;
        extra._veh_brand = vehs[0].brand || '';
        extra._veh_model = vehs[0].model || '';
        extra._veh_plate = vehs[0].plate || '';
        extra._veh_color = vehs[0].color || '';
        extra._veh_parking_sector = vehs[0].parking_sector || '';
      }
      if (Object.keys(extra).length) setEditing({ ...normalized, ...extra });
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
    // Handle vehicle
    const vehPlate = data._veh_plate?.trim().toUpperCase();
    const existingVehId = data._veh_id;
    if (vehPlate) {
      const vehData = {
        person_id: personId,
        person_name: personData.full_name,
        company: userCompany || personData.productora || personData.company || '',
        brand: data._veh_brand?.trim() || '',
        model: data._veh_model?.trim() || '',
        plate: vehPlate,
        color: data._veh_color?.trim() || '',
        parking_sector: data._veh_parking_sector || '',
        event_ids: personData.event_id ? [personData.event_id] : [],
        event_names: events.filter((e) => e.id === personData.event_id).map((e) => e.name),
        status: 'pending',
      };
      if (existingVehId) {
        await base44.entities.Vehicle.update(existingVehId, vehData);
      } else {
        await base44.entities.Vehicle.create(vehData);
      }
    } else if (existingVehId) {
      try { await base44.entities.Vehicle.delete(existingVehId); } catch {}
    }
  };
  const handleDelete = async () => {
    await base44.functions.invoke('deletePerson', { person_id: editing.id });
    await reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Directorio" title="Personal de Empresas">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        {canManageRecords && (
          <button onClick={() => setDniScannerOpen(true)} className={btnOutline}>
            <ScanLine className="h-4 w-4" /> Escanear DNI
          </button>
        )}
        {canManageRecords && (
          <button onClick={() => setImportOpen(true)} className={btnOutline}>
            <FileSpreadsheet className="h-4 w-4" /> Importar Excel
          </button>
        )}
        {canManageRecords && (
          <button onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Nuevo empleado
          </button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, empresa o documento…" />
        <FilterSelect value={areaFilter} onChange={setAreaFilter} options={zones.map((z) => ({ value: z.value, label: z.label }))} placeholder="Todas las áreas" />
        <FilterSelect value={companyFilter} onChange={setCompanyFilter} options={companies.map((c) => ({ value: c.name, label: c.name }))} placeholder="Todas las empresas" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
        <FilterSelect value={insuranceFilter} onChange={setInsuranceFilter} options={INSURANCE_OPTIONS} placeholder="Estado de seguro" />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-emerald-700">{selected.size} seleccionada(s)</span>
          <button onClick={handleExportSelected} className={btnOutline}>
            <Download className="h-4 w-4" /> Exportar selección
          </button>
          {canManageRecords && (
            <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar selección
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
        </div>
      )}

      <DataTable
        loading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay empleados registrados todavía.'}
        tableClassName="min-w-[900px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th className="w-10">
              <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            </Th>
            <Th>Persona</Th>
            <Th>Tipo / Área</Th>
            <Th>Empresa</Th>
            <Th>Seguro</Th>
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
              <Td>
                {isPersonInsured(p, coverageMap) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" title="Cubierto por seguro aprobado">
                    <ShieldCheck className="h-3.5 w-3.5" /> Asegurado
                  </span>
                ) : isPersonInsurancePending(p, coverageMap) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600" title="Seguro cargado, pendiente de aprobación">
                    <ShieldAlert className="h-3.5 w-3.5" /> En revisión
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" title="No cubierto por seguro aprobado">
                    <ShieldAlert className="h-3.5 w-3.5" /> Sin seguro
                  </span>
                )}
              </Td>
              <Td className="text-sm text-slate-500">{p.phone || p.email || '—'}</Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td className="text-right">
                <div className="inline-flex items-center gap-1">
                  {canManageRecords && (
                    <button onClick={() => setDocUploadPerson(p)} className={btnIcon} title="Subir documento">
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canManageRecords && (
                    <button onClick={() => openEdit(p)} className={btnIcon} title="Editar">
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
        onClose={() => { setModalOpen(false); setDniPrefill(null); }}
        title={editing ? 'Editar empleado' : 'Nuevo empleado'}
        kicker={editing ? 'EDITAR EMPLEADO' : 'CREAR EMPLEADO'}
        fields={fields}
        initialData={editing || dniPrefill || {}}
        onSubmit={handleSubmit}
        validate={validatePerson}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing && canManageRecords}
        submitLabel={editing ? 'Guardar cambios' : 'Crear empleado'}
        entityName="Person"
        onFieldChange={(name, value) => { if (name === 'event_id') setSelectedEventId(value); }}
      />

      <DniScannerModal open={dniScannerOpen} onClose={() => setDniScannerOpen(false)} onScanned={handleDniScanned} />

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} />
      )}

      <AdminEmployeeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        companies={companies}
        events={events}
      />

      <PersonDocUploadModal
        person={docUploadPerson}
        onClose={() => setDocUploadPerson(null)}
        onUploaded={() => setDocUploadPerson(null)}
      />
    </div>
  );
}