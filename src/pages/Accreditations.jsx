import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Printer, Download, ScanFace, Trash2 } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import BiometricButton from '@/components/BiometricButton';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import BadgePrint from '@/components/BadgePrint';
import BatchBadgePrint from '@/components/BatchBadgePrint';
import DniToBiometric from '@/components/DniToBiometric';
import BatchVehicleBadgePrint from '@/components/BatchVehicleBadgePrint';
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
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { logAudit } from '@/lib/audit';
import { getInsuranceStatus } from '@/lib/insuranceUtils';
import { pickPersonDefaultEvent } from '@/lib/personDefaultEvent';
import { useAuth } from '@/lib/AuthContext';
import { canModify } from '@/lib/accessUtils';
import { buildPhaseOptions, getShowDays } from '@/lib/eventPhases';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'revoked', label: 'Revocada' },
];

export default function Accreditations() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Accreditation');
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
  const accessLevels = [...new Set(zones.map((z) => z.value))];
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [badgeAccred, setBadgeAccred] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [dniBioAccred, setDniBioAccred] = useState(null);
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
          base44.entities.Person.list('-created_date', 200),
          base44.entities.SystemSetting.list('-created_date', 1),
        ]);
        setEvents(evs);
        setPeople(ps);
        setSettings(sts[0] || null);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (eventFilter) result = result.filter((a) => a.event_id === eventFilter);
    if (statusFilter) result = result.filter((a) => a.status === statusFilter);
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((a) =>
        `${a.person_name} ${a.badge_code} ${a.person_type}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, eventFilter, statusFilter, query]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const allFilteredIds = useMemo(() => filtered.map((a) => a.id), [filtered]);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
    if (!confirm(`¿Eliminar ${selected.size} acreditación(es)? Esta acción no se puede deshacer.`)) return;
    for (const id of selected) {
      const accred = items.find((a) => a.id === id);
      if (accred) await deleteVehiclesForPersonEvent(accred.person_id, accred.event_id);
      try { await base44.entities.Accreditation.delete(id); } catch {}
    }
    setSelected(new Set());
    await reload();
  };

  const handleBatchPrint = () => {
    const selectedAccreds = filtered.filter((a) => selected.has(a.id));
    if (selectedAccreds.length === 0) return;
    setBatchOpen(true);
  };

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Evento', 'Código', 'Área de acceso', 'Estado', 'Biometría'],
      filtered.map((a) => [
        a.person_name || '',
        zones.find((z) => z.value === a.person_type)?.label || a.person_type || '',
        a.event_name || '',
        a.badge_code || '',
        zones.find((z) => z.value === (a.access_level || a.area))?.label || a.access_level || a.area || '',
        a.status || '',
        a.has_biometric ? 'Sí' : 'No',
      ]),
      'acreditaciones'
    );
  };

  const eventOptions = events
    .filter((e) => e.status !== 'closed' || (editing && editing.event_id === e.id))
    .map((e) => ({ value: e.id, label: e.name }));
  const personOptions = people.map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` }));
  const phaseOptions = buildPhaseOptions(getShowDays(events, selectedEventId || editing?.event_id || ''));

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true },
    ...(editing ? [{ name: 'badge_code', label: 'Código de credencial', type: 'text', required: true }] : []),
    {
      name: 'access_level', label: 'Zonas de acceso', type: 'toggle-group',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
      hint: 'Seleccioná una, varias o todas las zonas disponibles.',
      full: true,
    },
    {
      name: 'event_phases', label: 'Días / Fases del evento', type: 'toggle-group',
      options: phaseOptions,
      hint: 'Seleccioná los días de show y fases (armado/desarme) en los que la persona tiene acceso.',
      full: true,
    },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS },
    { name: 'block_reason', label: 'Motivo de bloqueo / denegación', type: 'textarea', full: true, hint: 'Documentá la razón si el acceso está bloqueado o revocado.', placeholder: 'Ej: Documentación vencida, sanción disciplinaria…' },
    { name: 'has_biometric', label: 'Biometría registrada', type: 'checkbox' },
    ...(editing ? [] : [
      { name: 'print_badge', label: 'Imprimir credencial al acreditar', type: 'checkbox' },
      {
        name: 'print_type', label: 'Credenciales a imprimir', type: 'toggle-group',
        options: [
          { value: 'personal', label: 'Personal' },
          { value: 'vehicular', label: 'Vehicular' },
        ],
        hint: 'Seleccioná personal, vehicular o ambas.',
      },
    ]),
    { name: 'delivered_personal', label: 'Credencial personal entregada', type: 'checkbox' },
    { name: 'delivered_vehicular', label: 'Credencial vehicular entregada', type: 'checkbox' },
  ];

  const openNew = () => {
    setEditing(null);
    setPersonVehicles([]);
    setVehicleApprovals({});
    const activeEvent = events.find((e) => e.status === 'active' && (!e.end_at || new Date(e.end_at).getTime() + (e.grace_hours || 0) * 3600000 > Date.now()));
    const defaultEventId = activeEvent?.id || '';
    setSelectedEventId(defaultEventId);
    setNewInitial({ event_id: defaultEventId });
    setModalOpen(true);
  };
  const openEdit = (item) => {
    const normalized = { ...item, access_level: item.access_level || item.area || '' };
    setPersonVehicles([]);
    setVehicleApprovals({});
    setSelectedEventId(item.event_id || '');
    if (Array.isArray(normalized.event_phases)) {
      normalized.event_phases = normalized.event_phases.join(',');
    }
    setEditing(normalized);
    setModalOpen(true);
  };

  const openPersonDetail = async (accred) => {
    let p = people.find((pp) => pp.id === accred.person_id);
    if (!p && accred.person_id) {
      try { p = await base44.entities.Person.get(accred.person_id); } catch {}
    }
    if (p) setDetailPerson(p);
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
        // Biometric check via backend (service role) so productoras can see empresa-created biometrics
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
    if (!editing) {
      const res = await base44.functions.invoke('checkPersonDocuments', { person_id: data.person_id, event_id: data.event_id });
      if (res.data?.has_pending) {
        throw new Error(`No se puede asignar: la persona tiene documentación pendiente o vencida (${res.data.pending_statuses.join(', ')}).`);
      }
    }
    const evt = events.find((e) => e.id === data.event_id);
    let person = people.find((p) => p.id === data.person_id);
    if (!person && data.person_id) {
      try { person = await base44.entities.Person.get(data.person_id); } catch {}
    }
    if (!editing && person) {
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
      badge_code: editing ? data.badge_code : generateBadgeCode(person?.person_type, items.map((a) => a.badge_code), typePrefixes),
      area: primaryZone,
      access_level: accessLevelValue,
      event_phases: finalPhases,
      status: data.status || 'active',
      block_reason: data.block_reason || '',
      has_biometric: data.has_biometric || false,
      delivered_personal: (!editing && data.print_badge && printTypes.includes('personal')) || !!data.delivered_personal,
      delivered_vehicular: (!editing && data.print_badge && printTypes.includes('vehicular') && approvedVehicles.length > 0) || !!data.delivered_vehicular,
    };
    let createdAccred = null;
    if (editing) {
      await update(editing.id, payload);
      await logAudit('update-accreditation', 'Accreditation', editing.id, `${person?.full_name} → ${evt?.name}`);
    } else {
      createdAccred = await create(payload);
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
      // Send confirmation email to company contact (#8)
      if (sendEmailEnabled && person?.company) {
        try {
          const comps = await base44.entities.ProviderCompany.filter({ name: person.company });
          if (comps[0]?.contact_email) {
            const approvedVehicles = personVehicles.filter((v) => vehicleApprovals[v.id]?.approved);
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
    }
    // Vehicle accreditation — apply per-vehicle approvals
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
    // Sync phases back to Person (productora authority)
    if (person && finalPhases.length > 0) {
      try {
        await base44.entities.Person.update(person.id, { event_phases: finalPhases });
      } catch {}
    }
    // Impresión opcional tras acreditar
    if (!editing && data.print_badge) {
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
  };

  const deleteVehiclesForPersonEvent = async (personId, eventId) => {
    if (!personId || !eventId) return;
    try {
      const vehs = await base44.entities.Vehicle.filter({ person_id: personId }, '-created_date', 50);
      const linked = vehs.filter((v) => Array.isArray(v.event_ids) && v.event_ids.includes(eventId));
      const evt = events.find((e) => e.id === eventId);
      for (const v of linked) {
        try {
          // Solo se desvincula el evento del vehículo; el registro se conserva en la persona.
          const remainingEventIds = v.event_ids.filter((id) => id !== eventId);
          const remainingEventNames = (v.event_names || []).filter((n) => n !== evt?.name);
          const updateData = {
            event_ids: remainingEventIds,
            event_names: remainingEventNames,
          };
          // Si el vehículo ya no está vinculado a ningún evento, deja de figurar como acreditado
          if (remainingEventIds.length === 0) {
            updateData.status = 'pending';
          }
          await base44.entities.Vehicle.update(v.id, updateData);
        } catch {}
      }
    } catch {}
  };

  const handleDelete = async () => {
    await logAudit('delete-accreditation', 'Accreditation', editing.id, editing.person_name);
    await deleteVehiclesForPersonEvent(editing.person_id, editing.event_id);
    await remove(editing.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Control de accesos" title="Acreditaciones">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nueva acreditación
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por persona, código o tipo…" />
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={events.map((e) => ({ value: e.id, label: e.name }))} placeholder="Todos los eventos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-emerald-700">{selected.size} seleccionada(s)</span>
          <button onClick={handleBatchPrint} className={btnOutline}>
            <Printer className="h-4 w-4" /> Imprimir selección
          </button>
          {canEdit && (
            <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar selección
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
        </div>
      )}

      <DataTable loading={loading} error={error} isEmpty={filtered.length === 0} emptyMessage="No hay acreditaciones registradas." tableClassName="min-w-[800px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th className="w-10">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </Th>
            <Th>Persona</Th>
            <Th>Evento</Th>
            <Th>Código</Th>
            <Th>Área de acceso</Th>
            <Th>Estado</Th>
            <Th>Entrega</Th>
            <Th>Bio</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => (
            <Tr key={a.id}>
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggleSelect(a.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </Td>
              <Td>
                <button
                  onClick={() => openPersonDetail(a)}
                  className="text-left text-sm font-semibold text-slate-900 transition hover:text-emerald-700 hover:underline"
                >
                  {a.person_name || '—'}
                </button>
                <p className="text-xs text-slate-400">{zones.find((z) => z.value === a.person_type)?.label || a.person_type}</p>
              </Td>
              <Td className="text-sm text-slate-500">{a.event_name || '—'}</Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{a.badge_code}</code></Td>
              <Td className="text-sm text-slate-500">{(a.access_level || a.area || '').split(',').map((z) => zones.find((zz) => zz.value === z.trim())?.label || z.trim()).filter(Boolean).join(', ') || '—'}</Td>
              <Td><StatusBadge status={a.status} /></Td>
              <Td>
                {a.delivered_personal && a.delivered_vehicular ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Completa</span>
                ) : a.delivered_personal ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200">Personal</span>
                ) : a.delivered_vehicular ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">Vehicular</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">Pendiente</span>
                )}
              </Td>
              <Td>
                <BiometricButton accreditation={a} onRegistered={reload} />
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setBadgeAccred(a)} className={btnIcon} title="Imprimir credencial">
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDniBioAccred(a)} className={btnIcon} title="Biometría desde DNI">
                    <ScanFace className="h-3.5 w-3.5" />
                  </button>
                  {canEdit && (
                    <button onClick={() => openEdit(a)} className={btnIcon} title="Editar">
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
        onClose={() => { setModalOpen(false); setPersonVehicles([]); setVehicleApprovals({}); setSelectedEventId(''); }}
        title={editing ? 'Editar acreditación' : 'Nueva acreditación'}
        kicker={editing ? 'EDITAR ACREDITACIÓN' : 'CREAR ACREDITACIÓN'}
        fields={fields}
        initialData={editing || newInitial}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing && canEdit}
        submitLabel={editing ? 'Guardar cambios' : 'Crear acreditación'}
        onFieldChange={handleFieldChange}
        entityName="Accreditation"
        topContent={personVehicles.length > 0 ? (
          <VehicleAccreditSection
            vehicles={personVehicles}
            approvals={vehicleApprovals}
            setApprovals={setVehicleApprovals}
            sectors={sectors}
            event={events.find((e) => e.id === (selectedEventId || editing?.event_id || ''))}
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

      {batchOpen && (
        <BatchBadgePrint
          accreditations={filtered.filter((a) => selected.has(a.id))}
          events={events}
          onClose={() => setBatchOpen(false)}
        />
      )}

      {dniBioAccred && (
        <DniToBiometric
          person={{ id: dniBioAccred.person_id, full_name: dniBioAccred.person_name, company: dniBioAccred.company }}
          onSaved={reload}
          onClose={() => setDniBioAccred(null)}
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