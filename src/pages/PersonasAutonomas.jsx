import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Download, Trash2, ScanLine, ShieldCheck, ShieldX, FileCheck2, FileWarning, IdCard, Loader2 } from 'lucide-react';
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

const validateAutonomo = (data) => {
  const e = {};
  if (!data.full_name?.trim()) e.full_name = 'El nombre es obligatorio';
  if (!data.document?.trim()) e.document = 'El documento es obligatorio';
  else if (!/^\d{7,8}$/.test(data.document.trim())) e.document = 'Debe tener 7 u 8 dígitos numéricos';
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

function InsuranceBadge({ doc }) {
  if (!doc) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
        <FileWarning className="h-3 w-3" /> Sin subir
      </span>
    );
  }
  const styles = {
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    rejected: 'bg-red-50 text-red-700 ring-red-200',
    expired: 'bg-red-50 text-red-700 ring-red-200',
  };
  const labels = { approved: 'Aprobado', pending: 'Pendiente', rejected: 'Rechazado', expired: 'Vencido' };
  const status = doc.expires_at && new Date(doc.expires_at + 'T23:59:59') < new Date() && doc.status === 'approved' ? 'expired' : doc.status;
  const cls = styles[status] || styles.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {status === 'approved' ? <ShieldCheck className="h-3 w-3" /> : <FileWarning className="h-3 w-3" />}
      {labels[status] || status}
    </span>
  );
}

export default function PersonasAutonomas() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Person');
  const { zones } = useZones();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [docFilter, setDocFilter] = useState('');
  const [detailPerson, setDetailPerson] = useState(null);
  const [dniScannerOpen, setDniScannerOpen] = useState(false);
  const [dniPrefill, setDniPrefill] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [events, setEvents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [accreditingId, setAccreditingId] = useState(null);

  const refreshDocs = async () => {
    try {
      const docs = await base44.entities.Document.list('-created_date', 500);
      setDocuments(docs);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      try {
        const [evs] = await Promise.all([
          base44.entities.Event.list('-start_at', 200),
        ]);
        setEvents(evs);
        await refreshDocs();
      } catch {}
    })();
  }, []);

  // Only autonomous persons
  const autonomos = useMemo(() => items.filter((p) => p.tipo_vinculo === 'autonomo'), [items]);

  // Latest insurance doc per person
  const insuranceByPerson = useMemo(() => {
    const map = {};
    for (const d of documents) {
      if (d.document_type !== 'work_insurance') continue;
      if (!map[d.person_id] || new Date(d.created_date) > new Date(map[d.person_id].created_date)) {
        map[d.person_id] = d;
      }
    }
    return map;
  }, [documents]);

  const filtered = useMemo(() => {
    let result = autonomos;
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((p) => `${p.full_name} ${p.document || ''}`.toLowerCase().includes(q));
    }
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (docFilter) {
      result = result.filter((p) => {
        const doc = insuranceByPerson[p.id];
        const status = !doc ? 'missing' : (doc.expires_at && new Date(doc.expires_at + 'T23:59:59') < new Date() && doc.status === 'approved' ? 'expired' : doc.status);
        return status === docFilter;
      });
    }
    return result;
  }, [autonomos, query, statusFilter, docFilter, insuranceByPerson]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleApproveInsurance = async (personId) => {
    const doc = insuranceByPerson[personId];
    if (!doc) return;
    try {
      const me = await base44.auth.me();
      await base44.entities.Document.update(doc.id, {
        status: 'approved',
        reviewed_by: me?.full_name || me?.email || '',
        reviewed_at: new Date().toISOString(),
      });
      await refreshDocs();
    } catch {}
  };

  const handleRejectInsurance = async (personId) => {
    const doc = insuranceByPerson[personId];
    if (!doc) return;
    try {
      const me = await base44.auth.me();
      await base44.entities.Document.update(doc.id, {
        status: 'rejected',
        reviewed_by: me?.full_name || me?.email || '',
        reviewed_at: new Date().toISOString(),
      });
      await refreshDocs();
    } catch {}
  };

  const handleAcreditar = async (person) => {
    setAccreditingId(person.id);
    try {
      const result = await base44.functions.invoke('checkPersonDocuments', {
        person_id: person.id,
        event_id: person.event_id,
      });
      if (result.has_pending) {
        alert(`No se puede acreditar: documentación pendiente (${result.pending_statuses.join(', ')}).`);
        return;
      }
      // Check if accreditation already exists
      const existing = await base44.entities.Accreditation.filter({
        person_id: person.id,
        event_id: person.event_id,
        status: 'active',
      });
      if (existing.length > 0) {
        alert('Esta persona ya tiene una acreditación activa para el evento.');
        return;
      }
      // Generate badge code
      const evt = events.find((e) => e.id === person.event_id);
      const prefix = (zones.find((z) => z.value === person.access_area)?.value || 'GE').substring(0, 2).toUpperCase();
      const count = await base44.entities.Accreditation.filter({ event_id: person.event_id });
      const num = String(count.length + 1).padStart(4, '0');
      const badge_code = `${prefix}-${num}`;
      await base44.entities.Accreditation.create({
        event_id: person.event_id,
        event_name: evt?.name || '',
        company: person.company || '',
        person_id: person.id,
        person_name: person.full_name,
        person_type: person.access_area || 'general',
        badge_code,
        area: person.access_area || '',
        access_level: person.access_area || 'general',
        event_phases: person.event_phases || [],
        status: 'active',
      });
      alert(`Acreditación creada: ${badge_code}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setAccreditingId(null);
    }
  };

  const fields = useMemo(() => {
    const activeEvents = events.filter((e) => {
      if (e.status === 'closed') return false;
      if (e.end_at) {
        const end = new Date(e.end_at);
        const graceMs = (e.grace_hours || 0) * 3600 * 1000;
        if (end.getTime() + graceMs < Date.now()) return false;
      }
      return true;
    });
    const editingEventId = editing?.event_id;
    if (editingEventId && !activeEvents.find((e) => e.id === editingEventId)) {
      const current = events.find((e) => e.id === editingEventId);
      if (current) activeEvents.push(current);
    }
    return [
      { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, full: true, placeholder: 'Ej: Juan Pérez' },
      { name: 'document', label: 'Documento', type: 'dni', required: true, placeholder: 'Ej: 12345678' },
      { name: 'phone', label: 'Teléfono (opcional)', type: 'phone-ar', hint: 'Código de área sin 0 y número sin 15. Ej: 11 12345678' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'Ej: juan@email.com' },
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
      { name: 'status', label: 'Estado', type: 'select', required: true, options: STATUS_OPTIONS },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Autónomo, responsable de sonido' },
      { name: '_face', label: 'Registro facial', type: 'face-capture', full: true },
    ];
  }, [zones, events, editing]);

  const openNew = () => { setEditing(null); setDniPrefill(null); setModalOpen(true); };
  const openEdit = async (item) => {
    setDniPrefill(null);
    const normalized = { ...item };
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
    personData.tipo_vinculo = 'autonomo';
    if (typeof personData.event_phases === 'string') {
      personData.event_phases = personData.event_phases.split(',').map((s) => s.trim()).filter(Boolean);
    }
    let userCompany = '';
    try {
      const me = await base44.auth.me();
      userCompany = me?.company || me?.data?.company || '';
      if (!personData.productora) personData.productora = userCompany;
    } catch {}
    let personId;
    if (editing) {
      await update(editing.id, personData);
      personId = editing.id;
    } else {
      const created = await create(personData);
      personId = created.id;
    }
    if (face_photo_url && face_descriptor?.length) {
      // SECURITY: Check for face duplicate on a different person
      const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
        face_descriptor,
        person_id: personId,
        event_id: personData.event_id,
      });
      if (dupCheck.is_duplicate) {
        alert(`SECURIDAD: Este rostro ya está registrado para "${dupCheck.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
        return;
      }
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
        company: userCompany || personData.productora || '',
        face_photo_url,
        face_descriptor,
        status: 'active',
      });
    }
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

  const handleExport = () => {
    exportToExcel(
      ['Nombre', 'Documento', 'Teléfono', 'Email', 'Área', 'Seguro', 'Estado'],
      filtered.map((p) => [
        p.full_name || '',
        p.document || '',
        p.phone || '',
        p.email || '',
        zones.find((z) => z.value === p.access_area)?.label || p.access_area || '',
        insuranceByPerson[p.id]?.status || 'sin subir',
        p.status || '',
      ]),
      'personas_autonomas'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Directorio" title="Personas Autónomas">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={() => setDniScannerOpen(true)} className={btnOutline}>
          <ScanLine className="h-4 w-4" /> Escanear DNI
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nueva persona
        </button>
      </PageHeader>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Personas autónomas:</strong> No dependen de una empresa. Su documentación (seguro) debe ser aprobada individualmente antes de poder acreditarlas en un evento.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o documento…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
        <FilterSelect
          value={docFilter}
          onChange={setDocFilter}
          options={[
            { value: 'missing', label: 'Sin subir' },
            { value: 'pending', label: 'Pendiente' },
            { value: 'approved', label: 'Aprobado' },
            { value: 'rejected', label: 'Rechazado' },
            { value: 'expired', label: 'Vencido' },
          ]}
          placeholder="Estado del seguro"
        />
      </div>

      <DataTable
        loading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay personas autónomas registradas.'}
        tableClassName="min-w-[900px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Persona</Th>
            <Th>Contacto</Th>
            <Th>Área</Th>
            <Th>Seguro</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((p) => {
            const doc = insuranceByPerson[p.id];
            const insuranceApproved = doc?.status === 'approved' && !(doc.expires_at && new Date(doc.expires_at + 'T23:59:59') < new Date());
            return (
              <Tr key={p.id}>
                <Td>
                  <button onClick={() => setDetailPerson(p)} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-600">{p.full_name}</button>
                  <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
                </Td>
                <Td className="text-sm text-slate-500">{p.phone || p.email || '—'}</Td>
                <Td>
                  {p.access_area ? (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{zones.find((z) => z.value === p.access_area)?.label || p.access_area}</span>
                  ) : <span className="text-sm text-slate-400">—</span>}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <InsuranceBadge doc={doc} />
                    {doc && doc.status === 'pending' && (
                      <>
                        <button onClick={() => handleApproveInsurance(p.id)} title="Aprobar seguro" className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-600 transition hover:bg-emerald-100">
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleRejectInsurance(p.id)} title="Rechazar seguro" className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 transition hover:bg-red-100">
                          <ShieldX className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </Td>
                <Td><StatusBadge status={p.status} /></Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {p.event_id && (
                      <button
                        onClick={() => handleAcreditar(p)}
                        disabled={!insuranceApproved || accreditingId === p.id}
                        title={!insuranceApproved ? 'El seguro debe estar aprobado' : 'Acreditar en evento'}
                        className={`rounded-md border p-1.5 transition ${insuranceApproved ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                      >
                        {accreditingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IdCard className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className={btnIcon}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setDniPrefill(null); }}
        title={editing ? 'Editar persona autónoma' : 'Nueva persona autónoma'}
        kicker={editing ? 'EDITAR PERSONA' : 'CREAR PERSONA AUTÓNOMA'}
        fields={fields}
        initialData={editing || dniPrefill || {}}
        onSubmit={handleSubmit}
        validate={validateAutonomo}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear persona'}
      />

      <DniScannerModal open={dniScannerOpen} onClose={() => setDniScannerOpen(false)} onScanned={handleDniScanned} />

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => { setDetailPerson(null); refreshDocs(); }} />
      )}
    </div>
  );
}