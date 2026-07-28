import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Download, Trash2, Pencil, Printer, ScanFace, IdCard } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import BadgePrint from '@/components/BadgePrint';
import BatchBadgePrint from '@/components/BatchBadgePrint';
import DniToBiometric from '@/components/DniToBiometric';
import { useCrud } from '@/lib/crud';
import { usePagination } from '@/lib/usePagination';
import { useZones } from '@/lib/useZones';
import { usePersonTypes } from '@/lib/usePersonTypes';
import { exportToExcel } from '@/lib/exportUtils';
import { generateBadgeCode } from '@/lib/badgeCode';
import { getUserCompany } from '@/lib/userCompany';
import { logAudit } from '@/lib/audit';

const PHASE_OPTIONS = [
  { value: 'armado', label: 'Armado' },
  { value: 'dia_evento', label: 'Show' },
  { value: 'desarme', label: 'Desarme' },
];

export default function Accreditations() {
  const { user } = useAuth();
  const { items: accreditations, loading, error, create, update, remove } = useCrud('Accreditation');
  const { zones } = useZones();
  const { personTypes } = usePersonTypes();
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [printAccred, setPrintAccred] = useState(null);
  const [batchPrint, setBatchPrint] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [biometricTarget, setBiometricTarget] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Event.list('-created_date', 200),
      base44.entities.Person.list('-created_date', 200),
    ]).then(([evs, ps]) => {
      setEvents(evs);
      setPeople(ps);
    }).catch(() => {});
  }, []);

  const userCompany = getUserCompany(user);
  const isProductora = user?.role === 'productora';

  const typePrefixes = useMemo(() => {
    const map = {};
    personTypes.forEach((t) => { map[t.value] = t.badge_prefix || 'GE'; });
    return map;
  }, [personTypes]);

  const filtered = useMemo(() => {
    return accreditations.filter((a) => {
      if (isProductora && a.company !== userCompany) return false;
      if (eventFilter && a.event_id !== eventFilter) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.person_name?.toLowerCase().includes(q) ||
               a.badge_code?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [accreditations, search, eventFilter, statusFilter, isProductora, userCompany]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleFieldChange = useCallback((name, value, setField, formData) => {
    if (name === 'person_id' && value) {
      const p = people.find((p) => p.id === value);
      if (p?.access_area) setField('access_level', p.access_area);
      if (p?.event_phases) {
        const phases = Array.isArray(p.event_phases) ? p.event_phases : [];
        setField('event_phases', phases.join(','));
      }
      // Check biometric status
      base44.entities.Biometric.filter({ person_id: value, status: 'active' }, '-created_date', 1)
        .then((bios) => setField('has_biometric', bios.length > 0))
        .catch(() => {});
    }
    if (name === 'event_id' && value) {
      const evt = events.find((e) => e.id === value);
      if (evt) setField('company', evt.company);
    }
  }, [people, events]);

  const fields = useMemo(() => [
    {
      name: 'event_id', label: 'Evento', type: 'searchable-select', required: true, full: true,
      options: events.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      name: 'person_id', label: 'Persona', type: 'searchable-select', required: true, full: true,
      options: people.map((p) => ({ value: p.id, label: `${p.full_name}${p.document ? ' — ' + p.document : ''}` })),
    },
    {
      name: 'access_level', label: 'Área de acceso', type: 'select',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
    },
    {
      name: 'event_phases', label: 'Fases del evento', type: 'toggle-group', full: true,
      options: PHASE_OPTIONS,
    },
    { name: 'status', label: 'Estado', type: 'select', options: [
      { value: 'active', label: 'Activa' },
      { value: 'blocked', label: 'Bloqueada' },
      { value: 'revoked', label: 'Revocada' },
    ], defaultValue: 'active' },
  ], [events, people, zones]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (a) => { setEditing(a); setModalOpen(true); };

  const handleSubmit = async (data) => {
    const evt = events.find((e) => e.id === data.event_id);
    const person = people.find((p) => p.id === data.person_id);

    // ALWAYS use the person's access_area and event_phases as primary source
    const zoneValue = person?.access_area || data.access_level || 'general';
    const personPhases = Array.isArray(person?.event_phases) ? person.event_phases : [];
    const formPhases = typeof data.event_phases === 'string'
      ? data.event_phases.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(data.event_phases) ? data.event_phases : []);
    const finalPhases = formPhases.length > 0 ? formPhases : personPhases;

    const enriched = {
      ...data,
      event_name: evt?.name || '',
      company: evt?.company || '',
      person_name: person?.full_name || '',
      person_type: zoneValue,
      person_email: person?.email || '',
      area: zoneValue,
      access_level: zoneValue,
      event_phases: finalPhases,
    };

    if (!editing) {
      // Generate badge code
      enriched.badge_code = generateBadgeCode(zoneValue, accreditations.map((a) => a.badge_code), typePrefixes);
    }

    if (editing) {
      await update(editing.id, enriched);
    } else {
      const created = await create(enriched);
      // Notify by email if person is registered
      if (person?.email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: person.email,
            subject: `Acreditación emitida — ${evt?.name || 'Evento'}`,
            body: `Hola ${person.full_name},<br><br>Tu acreditación para <strong>${evt?.name}</strong> ha sido emitida.<br><br>Código de credencial: <strong>${enriched.badge_code}</strong><br>Área: ${zones.find((z) => z.value === zoneValue)?.label || zoneValue}<br><br>Retiro de credenciales: ${evt?.pickup_address || 'A confirmar'}${evt?.pickup_date ? ' — ' + evt.pickup_date : ''}<br><br>Saludos.`,
          });
        } catch {}
      }
      // Auto-open badge print
      setPrintAccred({ ...created, event_name: evt?.name, ...enriched });
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

  const handleBulkPrint = () => {
    const selectedAccredits = filtered.filter((a) => selected.has(a.id));
    setBatchPrint(selectedAccredits);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Eliminar ${selected.size} acreditaciones?`)) return;
    await Promise.all([...selected].map((id) => remove(id)));
    setSelected(new Set());
  };

  const handleExport = () => {
    const headers = ['Código', 'Persona', 'Evento', 'Área', 'Fases', 'Biometría', 'Estado'];
    const rows = filtered.map((a) => [
      a.badge_code, a.person_name, a.event_name,
      zones.find((z) => z.value === a.access_level)?.label || a.access_level,
      (a.event_phases || []).join(', '),
      a.has_biometric ? 'Sí' : 'No',
      a.status,
    ]);
    exportToExcel(headers, rows, 'acreditaciones');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Acreditaciones">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva acreditación
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o código…" />
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={events.map((e) => ({ value: e.id, label: e.name }))} placeholder="Todos los eventos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'active', label: 'Activa' },
          { value: 'blocked', label: 'Bloqueada' },
          { value: 'revoked', label: 'Revocada' },
        ]} placeholder="Todos los estados" />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-700">{selected.size} seleccionada(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={handleBulkPrint} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
              <Printer className="h-3.5 w-3.5" /> Imprimir credenciales
            </button>
            <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          </div>
        </div>
      )}

      <DataTable loading={loading} isEmpty={filtered.length === 0} error={error} emptyMessage="No hay acreditaciones emitidas." skeletonCols={7}>
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th className="w-8">
              <input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={() => {
                if (selected.size === paginated.length) setSelected(new Set());
                else setSelected(new Set(paginated.map((a) => a.id)));
              }} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            </Th>
            <Th>Código</Th>
            <Th>Persona</Th>
            <Th>Evento</Th>
            <Th>Área</Th>
            <Th>Bio</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => (
            <Tr key={a.id}>
              <Td>
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
              </Td>
              <Td>
                <span className="font-mono text-xs font-bold text-slate-900">{a.badge_code}</span>
              </Td>
              <Td>
                <p className="font-semibold text-slate-900">{a.person_name}</p>
              </Td>
              <Td className="text-sm text-slate-600">{a.event_name}</Td>
              <Td>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {zones.find((z) => z.value === a.access_level)?.label || a.access_level}
                </span>
              </Td>
              <Td>
                {a.has_biometric ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><ScanFace className="h-4 w-4" /></span>
                ) : (
                  <button onClick={() => setBiometricTarget(a)} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600" title="Registrar biometría">
                    <ScanFace className="h-4 w-4" />
                  </button>
                )}
              </Td>
              <Td><StatusBadge status={a.status} /></Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setPrintAccred(a)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Imprimir credencial">
                    <Printer className="h-4 w-4" />
                  </button>
                  <button onClick={() => openEdit(a)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Editar">
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
        title={editing ? `Acreditación ${editing.badge_code}` : 'Nueva acreditación'}
        kicker={editing ? 'EDITAR ACREDITACIÓN' : 'CREAR ACREDITACIÓN'}
        fields={fields}
        initialData={editing || { status: 'active', event_phases: [] }}
        onSubmit={handleSubmit}
        onFieldChange={handleFieldChange}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar cambios' : 'Crear acreditación'}
      />

      {printAccred && (
        <BadgePrint
          accreditation={printAccred}
          event={events.find((e) => e.id === printAccred.event_id)}
          onClose={() => setPrintAccred(null)}
        />
      )}

      {batchPrint.length > 0 && (
        <BatchBadgePrint
          accreditations={batchPrint}
          events={events}
          onClose={() => { setBatchPrint([]); setSelected(new Set()); }}
        />
      )}

      {biometricTarget && (
        <DniToBiometric
          accreditation={biometricTarget}
          person={people.find((p) => p.id === biometricTarget.person_id)}
          onClose={() => setBiometricTarget(null)}
          onSaved={() => {
            // Refresh has_biometric status
            base44.entities.Accreditation.update(biometricTarget.id, { has_biometric: true }).then(() => {
              setBiometricTarget(null);
              window.location.reload();
            });
          }}
        />
      )}
    </div>
  );
}