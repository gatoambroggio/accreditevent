import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, UserPlus, FileImage, ScanFace, CheckCircle2, FileText, CalendarDays, MapPin, ScanLine, Heart, Car } from 'lucide-react';
import DniScannerModal from '@/components/DniScannerModal';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import FaceCapture from '@/components/FaceCapture';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { extractFaceFromDni } from '@/lib/dniFaceExtract';
import { buildShowDayOptions, SETUP_PHASE_OPTIONS } from '@/lib/eventPhases';

const EMPTY = { first_name: '', last_name: '', document: '', phone: '', employment_type: 'fijo', access_area: '', event_phases: [], event_ids: [], notes: '', obra_social: '', carnet_obra_social: '', emergency_contact_name: '', emergency_contact_phone: '', allergies: '', blood_type: '', coordinator_name: '', veh_id: null, veh_plate: '', veh_brand: '', veh_model: '', veh_color: '', veh_type: 'auto', veh_parking_sector: '' };
const normalizeType = (v) => (v === 'eventual' || v === 'esporadico' ? 'eventual' : 'fijo');

function buildForm(editing) {
  if (!editing) return EMPTY;
  const parts = (editing.full_name || '').split(' ');
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    document: editing.document || '',
    phone: editing.phone || '',
    employment_type: normalizeType(editing.employment_type),
    access_area: editing.access_area || '',
    event_phases: Array.isArray(editing.event_phases) ? editing.event_phases : [],
    event_ids: Array.isArray(editing.event_ids) ? editing.event_ids : [],
    notes: editing.notes || '',
    obra_social: editing.obra_social || '',
    carnet_obra_social: editing.carnet_obra_social || '',
    emergency_contact_name: editing.emergency_contact_name || '',
    emergency_contact_phone: editing.emergency_contact_phone || '',
    allergies: editing.allergies || '',
    blood_type: editing.blood_type || '',
    coordinator_name: editing.coordinator_name || '',
    veh_id: null,
    veh_plate: '',
    veh_brand: '',
    veh_model: '',
    veh_color: '',
    veh_type: 'auto',
    veh_parking_sector: '',
  };
}

export default function EmployeeFormModal({ open, onClose, onSubmit, editing, companyName, approvedEvents = [] }) {
  const { zones } = useZones();
  const { sectors } = useParkingSectors();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => buildForm(editing));
  const [dniFile, setDniFile] = useState(null);
  const [faceFile, setFaceFile] = useState(null);
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [existingDni, setExistingDni] = useState(null);
  const [existingFaceUrl, setExistingFaceUrl] = useState(null);
  const [dniScannerOpen, setDniScannerOpen] = useState(false);
  const [dniFaceUrl, setDniFaceUrl] = useState(null);
  const [dniFaceDescriptor, setDniFaceDescriptor] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(buildForm(editing));
    setDniFile(null);
    setFaceFile(null);
    setFaceDescriptor(null);
    setDniFaceUrl(null);
    setDniFaceDescriptor(null);
    if (editing?.id) {
      base44.entities.Document.filter({ person_id: editing.id, document_type: 'dni' })
        .then((docs) => setExistingDni(docs[0] || null))
        .catch(() => setExistingDni(null));
      base44.entities.Biometric.filter({ person_id: editing.id, status: 'active' })
        .then((existing) => setExistingFaceUrl(existing[0]?.face_photo_url || null))
        .catch(() => setExistingFaceUrl(null));
      base44.entities.Vehicle.filter({ person_id: editing.id }, '-created_date', 1)
        .then((vehs) => {
          if (vehs[0]) {
            setForm((f) => ({
              ...f,
              veh_id: vehs[0].id,
              veh_plate: vehs[0].plate || '',
              veh_brand: vehs[0].brand || '',
              veh_model: vehs[0].model || '',
              veh_color: vehs[0].color || '',
              veh_type: vehs[0].vehicle_type || 'auto',
              veh_parking_sector: vehs[0].parking_sector || '',
            }));
          }
        })
        .catch(() => {});
    } else {
      setExistingDni(null);
      setExistingFaceUrl(null);
    }
  }, [editing, open]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  // Fases dinámicas: usa el mayor show_days entre los eventos asignados al empleado
  const showDayOptions = useMemo(() => {
    const selected = (form.event_ids || [])
      .map((id) => approvedEvents.find((e) => e.event_id === id))
      .filter(Boolean);
    const maxDays = selected.length
      ? Math.max(...selected.map((e) => Number(e.show_days) || 1))
      : 6;
    return buildShowDayOptions(Math.min(6, Math.max(1, maxDays)));
  }, [form.event_ids, approvedEvents]);

  const handleDniScanned = (data) => {
    setForm((f) => ({
      ...f,
      first_name: data.nombre || f.first_name,
      last_name: data.apellido || f.last_name,
      document: data.dni || f.document,
    }));
    if (data.faceUrl) {
      setExistingFaceUrl(data.faceUrl);
      setDniFaceUrl(data.faceUrl);
      setDniFaceDescriptor(data.faceDescriptor);
    }
  };

  const togglePhase = (phase) => {
    setForm((f) => {
      const current = f.event_phases || [];
      if (current.includes(phase)) {
        return { ...f, event_phases: current.filter((p) => p !== phase) };
      }
      let next = [...current, phase];
      // Excluyencia: "Día del show" (dia_evento) vs días específicos (dia_1..dia_6)
      if (phase === 'dia_evento') {
        next = next.filter((p) => !/^dia_\d$/.test(p));
      } else if (/^dia_\d$/.test(phase)) {
        next = next.filter((p) => p !== 'dia_evento');
      }
      return { ...f, event_phases: next };
    });
  };

  const toggleEvent = (eventId) => {
    setForm((f) => ({
      ...f,
      event_ids: f.event_ids.includes(eventId)
        ? f.event_ids.filter((id) => id !== eventId)
        : [...f.event_ids, eventId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const full_name = `${form.first_name} ${form.last_name}`.trim();
    if (!full_name) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!form.document || !/^\d{7,8}$/.test(form.document.trim())) {
      setError('El DNI es obligatorio y debe tener 7 u 8 dígitos numéricos.');
      return;
    }
    if (form.phone && form.phone.replace(/\D/g, '').length < 10) {
      setError('El teléfono está incompleto. Ingresá código de área + número (mínimo 10 dígitos).');
      return;
    }
    setSaving(true);
    try {
      // SECURITY: Check DNI + email duplicate BEFORE creating person
      const docCheck = await base44.functions.invoke('checkDocumentDuplicate', {
        document: form.document,
        email: null,
        person_id: editing?.id || null,
      });
      if (docCheck.data?.is_duplicate) {
        throw new Error(`Ya existe una persona con ese DNI: ${docCheck.data.existing_person.full_name} (${docCheck.data.existing_person.company || 'sin empresa'}). No pueden haber dos personas con el mismo documento.`);
      }

      // SECURITY: Check face duplicate BEFORE creating person
      const descriptorToCheck = faceDescriptor?.length ? faceDescriptor : (dniFaceDescriptor?.length ? dniFaceDescriptor : null);
      if (descriptorToCheck) {
        const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
          face_descriptor: descriptorToCheck,
          person_id: editing?.id || null,
        });
        if (dupCheck.data?.is_duplicate) {
          throw new Error(`Este rostro ya está registrado para "${dupCheck.data.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
        }
      }
      setStatus('Guardando empleado…');
      const event_names = form.event_ids
        .map((id) => approvedEvents.find((e) => e.event_id === id)?.event_name)
        .filter(Boolean);
      const person = await onSubmit({
        full_name,
        document: form.document,
        phone: form.phone,
        employment_type: form.employment_type,
        access_area: form.access_area,
        event_phases: form.event_phases,
        event_ids: form.event_ids,
        event_names,
        notes: form.notes,
        obra_social: form.obra_social,
        carnet_obra_social: form.carnet_obra_social,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        allergies: form.allergies,
        blood_type: form.blood_type,
        coordinator_name: form.coordinator_name,
        company: companyName,
        person_type: form.access_area || 'general',
        tipo_vinculo: 'empresa',
        status: 'active',
      });

      let uploadWarning = null;
      try {
        if (dniFile) {
          setStatus('Subiendo DNI…');
          const { file_url } = await base44.integrations.Core.UploadFile({ file: dniFile });
          await base44.entities.Document.create({
            person_id: person.id,
            person_name: full_name,
            company: companyName,
            document_type: 'dni',
            original_name: dniFile.name,
            file_url,
            mime_type: dniFile.type,
            size: dniFile.size,
            status: 'pending',
          });
          if (dniFile.type.startsWith('image/') && !faceFile) {
            setStatus('Extrayendo rostro del DNI…');
            try {
              await extractFaceFromDni(dniFile, person, companyName);
            } catch (faceErr) {
              uploadWarning = uploadWarning || 'No se pudo extraer el rostro del DNI para biometría.';
            }
          }
        }
        if (faceFile) {
          setStatus('Procesando biometría…');
          const { file_url } = await base44.integrations.Core.UploadFile({ file: faceFile });
          try {
            const existing = await base44.entities.Biometric.filter({ person_id: person.id, status: 'active' });
            for (const b of existing) {
              await base44.entities.Biometric.update(b.id, { status: 'revoked' });
            }
          } catch {}
          await base44.entities.Biometric.create({
            person_id: person.id,
            person_name: full_name,
            company: companyName,
            face_photo_url: file_url,
            face_descriptor: faceDescriptor || [],
            status: 'active',
          });
        } else if (dniFaceUrl && dniFaceDescriptor) {
          setStatus('Registrando biometría del DNI…');
          try {
            const existing = await base44.entities.Biometric.filter({ person_id: person.id, status: 'active' });
            for (const b of existing) {
              await base44.entities.Biometric.update(b.id, { status: 'revoked' });
            }
          } catch {}
          await base44.entities.Biometric.create({
            person_id: person.id,
            person_name: full_name,
            company: companyName,
            face_photo_url: dniFaceUrl,
            face_descriptor: dniFaceDescriptor,
            status: 'active',
          });
        }
      } catch (uploadErr) {
        uploadWarning = uploadErr.message || 'No se pudo completar la carga de DNI/biometría.';
      }

      // Handle vehicle
      try {
        const vehPlate = form.veh_plate?.trim().toUpperCase();
        if (vehPlate && form.veh_brand?.trim() && form.veh_model?.trim()) {
          setStatus('Guardando vehículo…');
          const vehData = {
            person_id: person.id,
            person_name: full_name,
            company: companyName,
            vehicle_type: form.veh_type || 'auto',
            brand: form.veh_brand.trim(),
            model: form.veh_model.trim(),
            plate: vehPlate,
            color: form.veh_color?.trim() || '',
            parking_sector: form.veh_parking_sector || '',
            event_ids: form.event_ids || [],
            event_names,
            status: 'pending',
          };
          if (form.veh_id) {
            await base44.entities.Vehicle.update(form.veh_id, vehData);
          } else {
            await base44.entities.Vehicle.create(vehData);
          }
        } else if (form.veh_id && !vehPlate) {
          try { await base44.entities.Vehicle.delete(form.veh_id); } catch {}
        }
      } catch (vehErr) {
        uploadWarning = uploadWarning || 'No se pudo guardar el vehículo.';
      }

      onClose(uploadWarning ? `Empleado guardado. ${uploadWarning}` : 'Empleado guardado correctamente.');
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
      setStatus('');
    }
  };

  if (!open) return null;

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
  const isPdf = existingDni?.file_url?.match(/\.(pdf)$/i);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">{editing ? 'Editar' : 'Nuevo'} empleado</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{editing ? editing.full_name : 'Cargar empleado'}</h2>
            </div>
          </div>
          <button onClick={() => onClose()} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {!editing && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <ScanLine className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700">Escaneo de DNI</p>
                <p className="text-xs text-slate-500">Extraé los datos del empleado desde su DNI.</p>
              </div>
              <button type="button" onClick={() => setDniScannerOpen(true)} className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                Escanear
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre *</span>
              <input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} required className={inputCls} placeholder="Juan" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Apellido *</span>
              <input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} required className={inputCls} placeholder="Pérez" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Documento (DNI) *</span>
              <input value={form.document} onChange={(e) => setField('document', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={8} required className={inputCls} placeholder="12345678" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono (opcional)</span>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} type="tel" className={inputCls} placeholder="11 12345678" />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de contratación</span>
              <select value={form.employment_type} onChange={(e) => setField('employment_type', e.target.value)} className={inputCls}>
                <option value="fijo">Fijo</option>
                <option value="eventual">Eventual</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600"><MapPin className="h-3 w-3" /> Área de acceso</span>
              <select value={form.access_area} onChange={(e) => setField('access_area', e.target.value)} className={inputCls}>
                <option value="">Sin asignar</option>
                {zones.map((z) => (<option key={z.value} value={z.value}>{z.label}</option>))}
              </select>
            </label>
          </div>
          <div className="space-y-3">
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fases de montaje</span>
              <div className="flex flex-wrap gap-1.5">
                {SETUP_PHASE_OPTIONS.map(({ value, label }) => {
                  const active = form.event_phases.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => togglePhase(value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                    >
                      {active && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Días de show</span>
              <div className="flex flex-wrap gap-1.5">
                {showDayOptions.map(({ value, label }) => {
                  const active = form.event_phases.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => togglePhase(value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                    >
                      {active && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Event assignment */}
          {approvedEvents.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <CalendarDays className="h-4 w-4" /> Eventos asignados
              </p>
              <p className="mb-3 text-xs text-slate-400">Seleccioná a qué eventos va a asistir este empleado. Las acreditaciones serán revisadas y aprobadas por la productora.</p>
              <div className="flex flex-wrap gap-1.5">
                {approvedEvents.map((ev) => {
                  const active = form.event_ids.includes(ev.event_id);
                  return (
                    <button
                      key={ev.event_id}
                      type="button"
                      onClick={() => toggleEvent(ev.event_id)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                    >
                      {active && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                      {ev.event_name}
                      {ev.productora && <span className="ml-1 text-[10px] font-normal opacity-60">· {ev.productora}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Notas (opcional)</span>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className={inputCls} placeholder="Observaciones internas…" />
          </label>

          {/* Ficha médica y de emergencia */}
          <div className="rounded-xl border border-red-100 bg-red-50/30 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600">
              <Heart className="h-4 w-4" /> Ficha médica y de emergencia (opcional)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Obra social</span>
                <input value={form.obra_social} onChange={(e) => setField('obra_social', e.target.value)} className={inputCls} placeholder="Ej: OSDE" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">N° de carnet / afiliado</span>
                <input value={form.carnet_obra_social} onChange={(e) => setField('carnet_obra_social', e.target.value)} className={inputCls} placeholder="Ej: 123456789" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Grupo sanguíneo</span>
                <select value={form.blood_type} onChange={(e) => setField('blood_type', e.target.value)} className={inputCls}>
                  <option value="">Sin especificar</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (<option key={bt} value={bt}>{bt}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Alergias a medicamentos</span>
                <input value={form.allergies} onChange={(e) => setField('allergies', e.target.value)} className={inputCls} placeholder="Ej: Penicilina, aspirina…" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Contacto de emergencia — Nombre</span>
                <input value={form.emergency_contact_name} onChange={(e) => setField('emergency_contact_name', e.target.value)} className={inputCls} placeholder="Ej: María Pérez" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Contacto de emergencia — Teléfono</span>
                <input value={form.emergency_contact_phone} onChange={(e) => setField('emergency_contact_phone', e.target.value)} type="tel" className={inputCls} placeholder="Ej: 11 12345678" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Coordinador / responsable asignado</span>
                <input value={form.coordinator_name} onChange={(e) => setField('coordinator_name', e.target.value)} className={inputCls} placeholder="Ej: Carlos Gómez" />
              </label>
            </div>
          </div>

          {/* Vehicle */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Car className="h-4 w-4" /> Vehículo (opcional)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Patente</span>
                <input value={form.veh_plate} onChange={(e) => setField('veh_plate', e.target.value)} className={inputCls} placeholder="Ej: AB123CD" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo</span>
                <select value={form.veh_type} onChange={(e) => setField('veh_type', e.target.value)} className={inputCls}>
                  <option value="auto">Auto</option>
                  <option value="moto">Moto</option>
                  <option value="camioneta">Camioneta</option>
                  <option value="camion">Camión</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Marca</span>
                <input value={form.veh_brand} onChange={(e) => setField('veh_brand', e.target.value)} className={inputCls} placeholder="Ej: Toyota" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Modelo</span>
                <input value={form.veh_model} onChange={(e) => setField('veh_model', e.target.value)} className={inputCls} placeholder="Ej: Corolla" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Color</span>
                <input value={form.veh_color} onChange={(e) => setField('veh_color', e.target.value)} className={inputCls} placeholder="Ej: Blanco" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Sector de estacionamiento</span>
                <select value={form.veh_parking_sector} onChange={(e) => setField('veh_parking_sector', e.target.value)} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {sectors.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
                </select>
              </label>
            </div>
          </div>

          {/* DNI */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <FileImage className="h-4 w-4" /> Foto / escane del DNI
            </p>
            {existingDni && !dniFile && (
              <div className="mb-3">
                {isPdf ? (
                  <a href={existingDni.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline">
                    <FileText className="h-4 w-4" /> Ver DNI actual (PDF)
                  </a>
                ) : (
                  <div className="h-28 w-full overflow-hidden rounded-lg border border-slate-200">
                    <Image src={existingDni.file_url} fittingType="fit" className="h-full w-full" alt="DNI actual" />
                  </div>
                )}
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setDniFile(e.target.files[0] || null)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700"
            />
            {dniFile && <p className="mt-2 text-xs text-emerald-700">{dniFile.name}</p>}
          </div>

          {/* Biometric */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <ScanFace className="h-4 w-4" /> Foto biométrica
              </p>
              {existingFaceUrl && !faceFile && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Ya registrada
                </span>
              )}
            </div>
            {existingFaceUrl && !faceFile && (
              <div className="mb-3 h-28 w-full overflow-hidden rounded-lg border border-slate-200">
                <Image src={existingFaceUrl} fittingType="fit" className="h-full w-full" alt="Foto biométrica actual" />
              </div>
            )}
            <FaceCapture
              onCaptured={(file, descriptor) => {
                setFaceFile(file);
                setFaceDescriptor(descriptor);
              }}
              label="Abrir cámara para capturar rostro"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onClose()} disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? (status || 'Guardando…') : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
      <DniScannerModal open={dniScannerOpen} onClose={() => setDniScannerOpen(false)} onScanned={handleDniScanned} />
    </div>
  );
}