import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import EntityModal from '@/components/EntityModal';
import VehicleAccreditSection from '@/components/VehicleAccreditSection';
import { useZones } from '@/lib/useZones';
import { usePersonTypes } from '@/lib/usePersonTypes';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { generateBadgeCode } from '@/lib/badgeCode';
import { getInsuranceStatus } from '@/lib/insuranceUtils';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'revoked', label: 'Revocada' },
];

export default function FacialAccreditationForm({ open, event, identifiedPerson, events, people, onCreated, onClose }) {
  const { zones } = useZones();
  const { personTypes } = usePersonTypes();
  const { sectors } = useParkingSectors();
  const typePrefixes = useMemo(() => {
    const map = {};
    personTypes.forEach((t) => { map[t.value] = t.badge_prefix || 'GE'; });
    return map;
  }, [personTypes]);

  const [initialData, setInitialData] = useState({});
  const [personVehicles, setPersonVehicles] = useState([]);
  const [vehicleApprovals, setVehicleApprovals] = useState({});
  const [selectedEventId, setSelectedEventId] = useState('');

  useEffect(() => {
    if (!open || !identifiedPerson) return;
    const p = identifiedPerson;
    setSelectedEventId(event?.id || '');
    setPersonVehicles([]);
    setVehicleApprovals({});
    setInitialData({
      event_id: event?.id || '',
      person_id: p.id || '',
      access_level: p.access_area || '',
      event_phases: Array.isArray(p.event_phases) ? p.event_phases.join(',') : '',
      status: 'active',
      has_biometric: true,
    });
    (async () => {
      try {
        const [bios, vehs] = await Promise.all([
          base44.entities.Biometric.filter({ person_id: p.id, status: 'active' }, '-created_date', 1),
          base44.entities.Vehicle.filter({ person_id: p.id }, '-created_date', 10),
        ]);
        setPersonVehicles(vehs);
        const init = {};
        vehs.forEach((v) => { init[v.id] = { approved: false, sector: v.parking_sector || '' }; });
        setVehicleApprovals(init);
        setInitialData((d) => ({ ...d, has_biometric: bios.length > 0 || true }));
      } catch {}
    })();
  }, [open, identifiedPerson, event]);

  const eventOptions = useMemo(
    () => (events || []).filter((e) => e.status !== 'closed').map((e) => ({ value: e.id, label: e.name })),
    [events]
  );
  const personOptions = useMemo(
    () => (people || []).map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` })),
    [people]
  );

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true },
    {
      name: 'access_level', label: 'Zonas de acceso', type: 'toggle-group',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
      hint: 'Seleccioná una, varias o todas las zonas disponibles.',
      full: true,
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
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS },
    { name: 'block_reason', label: 'Motivo de bloqueo / denegación', type: 'textarea', full: true, hint: 'Documentá la razón si el acceso está bloqueado o revocado.', placeholder: 'Ej: Documentación vencida, sanción disciplinaria…' },
    { name: 'has_biometric', label: 'Biometría registrada', type: 'checkbox' },
  ];

  const handleFieldChange = async (name, value, setField) => {
    if (name === 'event_id') setSelectedEventId(value);
    if (name === 'person_id' && value) {
      const p = people.find((p) => p.id === value);
      if (p?.access_area) setField('access_level', p.access_area);
      if (p?.event_phases) setField('event_phases', Array.isArray(p.event_phases) ? p.event_phases.join(',') : p.event_phases);
      try {
        const [bios, vehs] = await Promise.all([
          base44.entities.Biometric.filter({ person_id: value, status: 'active' }, '-created_date', 1),
          base44.entities.Vehicle.filter({ person_id: value }, '-created_date', 10),
        ]);
        setField('has_biometric', bios.length > 0);
        setPersonVehicles(vehs);
        const init = {};
        vehs.forEach((v) => { init[v.id] = { approved: false, sector: v.parking_sector || '' }; });
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
    if (existing.length > 0) {
      throw new Error('Esta persona ya tiene una credencial registrada para este evento.');
    }
    const docRes = await base44.functions.invoke('checkPersonDocuments', { person_id: data.person_id, event_id: data.event_id });
    if (docRes.data?.has_pending) {
      throw new Error(`No se puede asignar: la persona tiene documentación pendiente o vencida (${docRes.data.pending_statuses.join(', ')}).`);
    }
    const evt = events.find((e) => e.id === data.event_id);
    let person = people.find((p) => p.id === data.person_id);
    if (!person && data.person_id) {
      try { person = await base44.entities.Person.get(data.person_id); } catch {}
    }
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
    const allAccreditations = await base44.entities.Accreditation.list('-created_date', 500);
    const badgeCode = generateBadgeCode(person?.person_type, allAccreditations.map((a) => a.badge_code), typePrefixes);
    const payload = {
      event_id: data.event_id,
      person_id: data.person_id,
      event_name: evt?.name || '',
      company: evt?.company || '',
      person_name: person?.full_name || '',
      person_type: primaryZone,
      person_email: person?.email || '',
      badge_code: badgeCode,
      area: primaryZone,
      access_level: accessLevelValue,
      event_phases: finalPhases,
      status: data.status || 'active',
      block_reason: data.block_reason || '',
      has_biometric: data.has_biometric || false,
    };
    const created = await base44.entities.Accreditation.create(payload);
    // Vehicle accreditation
    const approvedVehicles = personVehicles.filter((v) => vehicleApprovals[v.id]?.approved);
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
    // Sync phases back to Person
    if (person && finalPhases.length > 0) {
      try { await base44.entities.Person.update(person.id, { event_phases: finalPhases }); } catch {}
    }
    if (onCreated) onCreated(created);
    setPersonVehicles([]);
    setVehicleApprovals({});
  };

  if (!open) return null;

  return (
    <EntityModal
      open={open}
      onClose={onClose}
      title="Confirmar acreditación facial"
      kicker="CREAR ACREDITACIÓN"
      fields={fields}
      initialData={initialData}
      onSubmit={handleSubmit}
      submitLabel="Crear acreditación"
      onFieldChange={handleFieldChange}
      entityName="Accreditation"
      topContent={personVehicles.length > 0 ? (
        <VehicleAccreditSection
          vehicles={personVehicles}
          approvals={vehicleApprovals}
          setApprovals={setVehicleApprovals}
          sectors={sectors}
          event={events.find((e) => e.id === (selectedEventId || event?.id || ''))}
        />
      ) : undefined}
    />
  );
}