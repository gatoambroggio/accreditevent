import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Download, IdCard } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import PersonDetailModal from '@/components/PersonDetailModal';
import VehicleAccreditSection from '@/components/VehicleAccreditSection';
import { useZones } from '@/lib/useZones';
import { usePersonTypes } from '@/lib/usePersonTypes';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { generateBadgeCode } from '@/lib/badgeCode';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { logAudit } from '@/lib/audit';
import { getInsuranceStatus } from '@/lib/insuranceUtils';
import { pickPersonDefaultEvent } from '@/lib/personDefaultEvent';
import { useAuth } from '@/lib/AuthContext';
import { canModify } from '@/lib/accessUtils';
import { buildShowDayOptions, SETUP_PHASE_OPTIONS, getShowDays, PHASE_EXCLUSIVE_GROUPS } from '@/lib/eventPhases';
import BadgePrint from '@/components/BadgePrint';
import BatchVehicleBadgePrint from '@/components/BatchVehicleBadgePrint';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'revoked', label: 'Revocada' },
];

export default function Accreditations() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Accreditation', { limit: 5000 });
  const { zones } = useZones();
  const { personTypes } = usePersonTypes();
  const { sectors } = useParkingSectors();
  const { user } = useAuth();
  const canEdit = canModify(user);
  const typePrefixes = useMemo(() => {
    const map = {};
    personTypes.forEach((t) => { map[t.value] = t.badge_prefix || 'GE'; });
    return map;
  }, [personTypes]);
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [query, setQuery] = useState('');
  const [badgeAccred, setBadgeAccred] = useState(null);
  const [personVehicles, setPersonVehicles] = useState([]);
  const [vehicleApprovals, setVehicleApprovals] = useState({});
  const [selectedEventId, setSelectedEventId] = useState('');
  const [settings, setSettings] = useState(null);
  const [detailPerson, setDetailPerson] = useState(null);
  const [vehicleBatchPrint, setVehicleBatchPrint] = useState(null);
  const [newInitial, setNewInitial] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [evs, ps, sts] = await Promise.all([
          base44.entities.Event.list('-created_date', 200),
          base44.entities.Person.list('-created_date', 500),
          base44.entities.SystemSetting.list('-created_date', 1),
        ]);
        setEvents(evs);
        setPeople(ps);
        setSettings(sts[0] || null);
        const activeEvent = evs.find((e) => e.status === 'active' && (!e.end_at || new Date(e.end_at).getTime() > Date.now()));
        if (activeEvent) setEventFilter(activeEvent.id);
      } catch {}
    })();
  }, []);

  // Personas ya acreditadas (cualquier acreditación activa) — no deben figurar como pendientes
  const activeAccreditedIds = useMemo(() => {
    const set = new Set();
    items.forEach((a) => { if (a.status === 'active') set.add(a.person_id); });
    return set;
  }, [items]);

  // Personas pendientes de acreditar (sin ninguna acreditación activa)
  const pendingPeople = useMemo(() => {
    let result = people.filter((p) => !activeAccreditedIds.has(p.id));
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((p) =>
        `${p.full_name} ${p.document || ''} ${p.company || ''} ${p.person_type || ''}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [people, activeAccreditedIds, query]);

  const { page, setPage, totalPages, paginated } = usePagination(pendingPeople, 15);

  const eventOptions = events
    .filter((e) => e.status !== 'closed' || eventFilter === e.id)
    .map((e) => ({ value: e.id, label: e.name }));

  const personOptions = people
    .filter((p) => !items.some((a) => a.person_id === p.id && a.event_id === selectedEventId))
    .map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` }));

  const showDaysCount = getShowDays(events, selectedEventId || editing?.event_id || eventFilter || '');
  const showDayOptions = buildShowDayOptions(showDaysCount);

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true, disabled: !!newInitial.person_id },
    {
      name: 'access_level', label: 'Zonas de acceso', type: 'toggle-group',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
      hint: 'Seleccioná una, varias o todas las zonas disponibles.',
      full: true,
    },
    {
      name: 'event_phases', label: 'Días / Fases del evento', type: 'toggle-group',
      sections: [
        { label: 'Fases de montaje', options: SETUP_PHASE_OPTIONS },
        { label: `Días de show (${showDaysCount} ${showDaysCount > 1 ? 'días' : 'día'})`, options: showDayOptions, exclusiveGroups: PHASE_EXCLUSIVE_GROUPS },
      ],
      hint: 'Días de show: elegí "Todo el show" o días específicos (Día 1..N), son mutuamente excluyentes. Armado y desarme son independientes.',
      full: true,
    },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS },
    { name: 'block_reason', label: 'Motivo de bloqueo / denegación', type: 'textarea', full: true, hint: 'Documentá la razón si el acceso está bloqueado o revocado.', placeholder: 'Ej: Documentación vencida, sanción disciplinaria…' },
    { name: 'has_biometric', label: 'Biometría registrada', type: 'checkbox' },
    { name: 'print_badge', label: 'Imprimir credencial al acreditar', type: 'checkbox' },
    {
      name: 'print_type', label: 'Credenciales a imprimir', type: 'toggle-group',
      options: [
        { value: 'personal', label: 'Personal' },
        { value: 'vehicular', label: 'Vehicular' },
      ],
      hint: 'Seleccioná personal, vehicular o ambas.',
    },
    { name: 'delivered_personal', label: 'Credencial personal entregada', type: 'checkbox' },
    { name: 'delivered_vehicular', label: 'Credencial vehicular entregada', type: 'checkbox' },
  ];

  const openNew = (personId) => {
    setEditing(null);
    setPersonVehicles([]);
    setVehicleApprovals({});
    const p = personId ? people.find((x) => x.id === personId) : null;
    const personEventId = p ? pickPersonDefaultEvent(p, events) : '';
    const activeEvent = events.find((e) => e.status === 'active' && (!e.end_at || new Date(e.end_at).getTime() > Date.now()));
    const defaultEventId = personEventId || eventFilter || activeEvent?.id || '';
    setSelectedEventId(defaultEventId);
    setNewInitial({
      event_id: defaultEventId,
      person_id: personId || '',
      access_level: p?.access_area || '',
      event_phases: Array.isArray(p?.event_phases) ? p.event_phases.join(',') : (p?.event_phases || ''),
    });
    setModalOpen(true);
  };

  const handleFieldChange = async (name, value, setField, formData) => {
    if (name === 'event_id') setSelectedEventId(value);
    if (name === 'person_id' && value) {
      const p = people.find((p) => p.id === value);
      if (p?.access_area) setField('access_level', p.access_area);
      if (p?.event_phases) setField('event_phases', Array.isArray(p.event_phases) ? p.event_phases.join(',') : p.event_phases);
      const defaultEventId = pickPersonDefaultEvent(p, events);
      if (defaultEventId) {
        setField('event_id', defaultEventId);
        setSelectedEventId(defaultEventId);
      }
      try {
        const [docCheck, vehs] = await Promise.all([
          base44.functions.invoke('checkPersonDocuments', { person_id: value, event_id: formData?.event_id }),
          base44.entities.Vehicle.filter({ person_id: value }, '-created_date', 10),
        ]);
        setField('has_biometric', !!docCheck?.data?.has_biometric);
        setPersonVehicles(vehs);
        const init = {};
        vehs.forEach((v) => { init[v.id] = { approved: true, sector: v.parking_sector || '' }; });
        setVehicleApprovals(init);
      } catch { setPersonVehicles([]); setVehicleApprovals({}); }
    }
  };

  const handleSubmit = async (data) => {
    const existing = await base44.entities.Accreditation.filter(
      { event_id: data.event_id, person_id: data.person_id },
      '-created_date',
      5
    );
    if (existing.some((a) => !editing || a.id !== editing.id)) {
      throw new Error('Esta persona ya tiene una credencial registrada para este evento.');
    }
    const res = await base44.functions.invoke('checkPersonDocuments', { person_id: data.person_id, event_id: data.event_id });
    if (res.data?.has_pending) {
      throw new Error(`No se puede asignar: la persona tiene documentación pendiente o vencida (${res.data.pending_statuses.join(', ')}).`);
    }
    const evt = events.find((e) => e.id === data.event_id);
    const person = people.find((p) => p.id === data.person_id);
    if (person) {
      const ins = await getInsuranceStatus(person);
      if (!ins.insured) {
        throw new Error(`No se puede acreditar: ${person?.full_name || 'la persona'} no tiene seguro aprobado${person?.company ? ` (empresa: ${person.company})` : ''}.`);
      }
    }
    const accessLevelValue = data.access_level || person?.access_area || 'general';
    const primaryZone = accessLevelValue.split(',')[0].trim() || 'general';
    const phasesFromForm = typeof data.event_phases === 'string'
      ? data.event_phases.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(data.event_phases) ? data.event_phases : []);
    const personPhases = Array.isArray(person?.event_phases) ? person.event_phases : [];
    const finalPhases = phasesFromForm.length > 0 ? phasesFromForm : personPhases;
    const approvedVehicles = personVehicles.filter((v) => vehicleApprovals[v.id]?.approved);
    const printTypes = String(data.print_type || '').split(',').map((s) => s.trim()).filter(Boolean);
    const payload = {
      event_id: data.event_id,
      person_id: data.person_id,
      event_name: evt?.name || '',
      company: evt?.company || '',
      person_name: person?.full_name || '',
      person_type: primaryZone,
      person_email: person?.email || '',
      badge_code: generateBadgeCode(person?.person_type, items.map((a) => a.badge_code), typePrefixes),
      area: primaryZone,
      access_level: accessLevelValue,
      event_phases: finalPhases,
      status: data.status || 'active',
      block_reason: data.block_reason || '',
      has_biometric: data.has_biometric || false,
      delivered_personal: (data.print_badge && printTypes.includes('personal')) || !!data.delivered_personal,
      delivered_vehicular: (data.print_badge && printTypes.includes('vehicular') && approvedVehicles.length > 0) || !!data.delivered_vehicular,
    };
    const createdAccred = await create(payload);
    await logAudit('create-accreditation', 'Accreditation', createdAccred.id, `${person?.full_name} → ${evt?.name}`);
    const sendEmailEnabled = settings?.enabled_modules?.accreditation_email ?? true;
    const sendWhatsAppEnabled = settings?.enabled_modules?.accreditation_whatsapp ?? true;
    if (evt?.pickup_address) {
      const mapsUrl = evt.pickup_lat && evt.pickup_lng
        ? `https://www.google.com/maps?q=${evt.pickup_lat},${evt.pickup_lng}`
        : `https://www.google.com/maps?q=${encodeURIComponent(evt.pickup_address)}`;
      const pickupDate = evt.pickup_date
        ? new Date(evt.pickup_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : 'a confirmar';
      const pickupTime = evt.pickup_start_time && evt.pickup_end_time
        ? `${evt.pickup_start_time} a ${evt.pickup_end_time} hs`
        : (evt.pickup_start_time || 'a confirmar');
      if (sendEmailEnabled && person?.email) {
        try {
          const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f0fdf4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#047857,#065f46);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">AccreditEvent</h1>
<p style="margin:8px 0 0;color:#a7f3d0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Tu acreditación está lista</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="margin:0 0 20px;color:#0f172a;font-size:16px;line-height:1.6;">Hola <strong>${person.full_name}</strong>,</p>
<p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.6;">Tu acreditación para <strong style="color:#047857;">${evt.name}</strong> ya está lista. Estos son los datos para el retiro:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:28px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">📅 Fecha de retiro</p>
<p style="margin:0 0 20px;color:#0f172a;font-size:15px;font-weight:700;">${pickupDate}</p>
<p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">🕐 Horario</p>
<p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;">${pickupTime}</p>
</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="${mapsUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">🗺️ Ver ubicación en Google Maps</a>
</td></tr></table>
<p style="margin:28px 0 0;color:#475569;font-size:14px;line-height:1.6;">¡Te esperamos!</p>
</td></tr>
<tr><td style="background-color:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">AccreditEvent · Sistema de acreditación de eventos</p>
</td></tr>
</table>
</td></tr>
</table></body></html>`;
          await base44.integrations.Core.SendEmail({
            to: person.email,
            subject: `Tu acreditación para ${evt.name} está lista`,
            body: htmlBody,
          });
        } catch {}
      }
      if (sendWhatsAppEnabled && person?.phone) {
        let cleanPhone = person.phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('54')) {
          cleanPhone = '54' + cleanPhone.replace(/^0/, '');
        }
        const waMessage = encodeURIComponent(
          `Hola ${person.full_name},\n\n` +
          `Tu acreditación para "${evt.name}" ya está lista.\n\n` +
          `Podés retirarla el día ${pickupDate}, en el horario de ${pickupTime}.\n\n` +
          `Ver ubicación en el mapa: ${mapsUrl}\n\n` +
          `Te esperamos.\n\nAccreditEvent`
        );
        const waLink = document.createElement('a');
        waLink.href = `https://wa.me/${cleanPhone}?text=${waMessage}`;
        waLink.target = '_blank';
        waLink.rel = 'noopener noreferrer';
        document.body.appendChild(waLink);
        waLink.click();
        document.body.removeChild(waLink);
      }
    }
    if (sendEmailEnabled && person?.company) {
      try {
        const comps = await base44.entities.ProviderCompany.filter({ name: person.company });
        if (comps[0]?.contact_email) {
          const vehicleLines = approvedVehicles.length > 0
            ? approvedVehicles.map((v) => `• ${v.brand} ${v.model} — Patente: ${v.plate}${v.color ? ` (${v.color})` : ''}`).join('<br>')
            : 'Sin vehículos acreditados.';
          await base44.integrations.Core.SendEmail({
            to: comps[0].contact_email,
            subject: `Acreditación confirmada — ${person.full_name} en ${evt.name}`,
            body: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;"><h2>Resumen de acreditación</h2><p><strong>Evento:</strong> ${evt.name}</p><h3>Personas acreditadas:</h3><p>• ${person.full_name} — ${person.document || 'sin documento'} (Credencial: ${payload.badge_code})</p><h3>Vehículos autorizados:</h3><p>${vehicleLines}</p></body></html>`,
          });
        }
      } catch {}
    }
    if (approvedVehicles.length > 0) {
      for (const v of approvedVehicles) {
        try {
          const currentEventIds = Array.isArray(v.event_ids) ? v.event_ids : [];
          const vehUpdate = { status: 'approved' };
          const sector = vehicleApprovals[v.id]?.sector;
          if (sector !== undefined) vehUpdate.parking_sector = sector;
          if (!currentEventIds.includes(data.event_id)) {
            vehUpdate.event_ids = [...currentEventIds, data.event_id];
            vehUpdate.event_names = [...(v.event_names || []), evt?.name].filter(Boolean);
          }
          await base44.entities.Vehicle.update(v.id, vehUpdate);
        } catch {}
      }
    }
    if (person && finalPhases.length > 0) {
      try {
        await base44.entities.Person.update(person.id, { event_phases: finalPhases });
      } catch {}
    }
    if (data.print_badge) {
      if (printTypes.includes('personal')) {
        setBadgeAccred(createdAccred);
      }
      if (printTypes.includes('vehicular') && approvedVehicles.length > 0) {
        const vehsForPrint = approvedVehicles.map((v) => ({
          ...v,
          parking_sector: vehicleApprovals[v.id]?.sector ?? v.parking_sector,
          event_ids: Array.from(new Set([...(Array.isArray(v.event_ids) ? v.event_ids : []), data.event_id])),
          event_names: Array.from(new Set([...(Array.isArray(v.event_names) ? v.event_names : []), evt?.name].filter(Boolean))),
        }));
        setVehicleBatchPrint({ vehicles: vehsForPrint, event: evt });
      }
    }
    setPersonVehicles([]);
    setVehicleApprovals({});
    await reload();
  };

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Documento', 'Tipo', 'Empresa', 'Teléfono', 'Evento'],
      pendingPeople.map((p) => [
        p.full_name || '',
        p.document || '',
        zones.find((z) => z.value === p.person_type)?.label || p.person_type || '',
        p.company || '',
        p.phone || '',
        events.find((e) => e.id === eventFilter)?.name || '',
      ]),
      'pendientes_acreditar'
    );
  };

  const openPersonDetail = (p) => {
    if (p) setDetailPerson(p);
  };

  const selectedEventName = events.find((e) => e.id === eventFilter)?.name || 'Todos los eventos';

  return (
    <div className="space-y-6">
      <PageHeader kicker="Control de accesos" title="Acreditaciones">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        {canEdit && (
          <button onClick={() => openNew('')} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Nueva acreditación
          </button>
        )}
      </PageHeader>

      <p className="text-sm text-slate-500 max-w-3xl">
        Listado de personas <strong>pendientes de acreditar</strong> (sin credencial activa). Una vez acreditadas, pasan al módulo <strong>Personal acreditado</strong>. El filtro de evento define para qué evento se las acreditará.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, documento o empresa…" />
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={eventOptions} placeholder="Todos los eventos" />
      </div>

      <DataTable loading={loading} error={error} isEmpty={pendingPeople.length === 0} emptyMessage="No hay personas pendientes de acreditar para el filtro seleccionado." emptyIcon={IdCard} tableClassName="min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Persona</Th>
            <Th>Documento</Th>
            <Th>Tipo</Th>
            <Th>Empresa</Th>
            <Th>Teléfono</Th>
            {canEdit && <Th className="text-right">Acción</Th>}
          </tr>
        </thead>
        <tbody>
          {paginated.map((p) => (
            <Tr key={p.id}>
              <Td>
                <button
                  onClick={() => openPersonDetail(p)}
                  className="text-left text-sm font-semibold text-slate-900 transition hover:text-emerald-700 hover:underline"
                >
                  {p.full_name || '—'}
                </button>
                {p.access_area && (
                  <p className="text-xs text-slate-400 capitalize">{p.access_area}</p>
                )}
              </Td>
              <Td className="text-sm text-slate-500">{p.document || '—'}</Td>
              <Td className="text-sm text-slate-500">{zones.find((z) => z.value === p.person_type)?.label || p.person_type || '—'}</Td>
              <Td className="text-sm text-slate-500">{p.company || '—'}</Td>
              <Td className="text-sm text-slate-500">{p.phone || '—'}</Td>
              {canEdit && (
                <Td className="text-right">
                  <button
                    onClick={() => openNew(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800"
                  >
                    <IdCard className="h-3.5 w-3.5" /> Acreditar
                  </button>
                </Td>
              )}
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {pendingPeople.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={pendingPeople.length} pageSize={15} />
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setPersonVehicles([]); setVehicleApprovals({}); setSelectedEventId(''); setNewInitial({}); }}
        title="Nueva acreditación"
        kicker="CREAR ACREDITACIÓN"
        fields={fields}
        initialData={newInitial}
        onSubmit={handleSubmit}
        submitLabel="Acreditar"
        onFieldChange={handleFieldChange}
        entityName="Accreditation"
        topContent={personVehicles.length > 0 ? (
          <VehicleAccreditSection
            vehicles={personVehicles}
            approvals={vehicleApprovals}
            setApprovals={setVehicleApprovals}
            sectors={sectors}
            event={events.find((e) => e.id === (selectedEventId || newInitial.event_id || ''))}
          />
        ) : undefined}
      />

      {badgeAccred && (
        <BadgePrint
          accreditation={badgeAccred}
          event={events.find((e) => e.id === badgeAccred.event_id)}
          onClose={() => setBadgeAccred(null)}
        />
      )}

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} readOnly={!canEdit} />
      )}

      {vehicleBatchPrint && (
        <BatchVehicleBadgePrint
          vehicles={vehicleBatchPrint.vehicles}
          settings={settings}
          events={events}
          sectors={sectors}
          onClose={() => setVehicleBatchPrint(null)}
        />
      )}
    </div>
  );
}