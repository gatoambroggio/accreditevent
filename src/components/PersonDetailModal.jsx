import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Loader2, FileText, ExternalLink, User, UploadCloud, Car, Plus, Pencil, Trash2, Printer, Check, XCircle, ScanFace, Heart, ShieldCheck, ShieldAlert } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Image } from '@/components/ui/image';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import DocumentViewer from '@/components/DocumentViewer';
import EntityModal from '@/components/EntityModal';
import VehicleBadgePrint from '@/components/VehicleBadgePrint';
import { useParkingSectors } from '@/lib/useParkingSectors';
import DniToBiometric from '@/components/DniToBiometric';
import { useCustomFields } from '@/lib/useCustomFields';
import { getInsuranceStatus } from '@/lib/insuranceUtils';

export default function PersonDetailModal({ person, onClose, readOnly = false }) {
  const [docs, setDocs] = useState([]);
  const [bio, setBio] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('work_insurance');
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [printingVehicle, setPrintingVehicle] = useState(null);
  const [events, setEvents] = useState([]);
  const [reviewingDoc, setReviewingDoc] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewAction, setReviewAction] = useState('');
  const [reviewExpiresAt, setReviewExpiresAt] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const { customFields } = useCustomFields('Person');
  const [dniBioOpen, setDniBioOpen] = useState(false);
  const [insurance, setInsurance] = useState(null);
  const { docTypes } = useDocumentTypes();
  const { sectors } = useParkingSectors();

  const isExpired = (d) => {
    if (d.status === 'expired') return true;
    if (d.status === 'approved' && d.expires_at && new Date(d.expires_at + 'T23:59:59') < new Date()) return true;
    return false;
  };

  const loadDocs = async (personId) => {
    const docData = await base44.entities.Document.filter({ person_id: personId }, '-created_date', 100);
    const active = docData.filter((d) => !isExpired(d));
    const expired = docData.filter((d) => isExpired(d)).slice(0, 3);
    setDocs([...active, ...expired]);
  };

  const loadVehicles = async (personId) => {
    const vehData = await base44.entities.Vehicle.filter({ person_id: personId }, '-created_date', 50);
    setVehicles(vehData);
  };

  useEffect(() => {
    if (!person) return;
    (async () => {
      try {
        const [docData, bioData, vehData, evs] = await Promise.all([
          base44.entities.Document.filter({ person_id: person.id }, '-created_date', 100),
          base44.entities.Biometric.filter({ person_id: person.id, status: 'active' }, '-created_date', 1),
          base44.entities.Vehicle.filter({ person_id: person.id }, '-created_date', 50),
          base44.entities.Event.list('-start_at', 200),
        ]);
        const active = docData.filter((d) => !isExpired(d));
        const expired = docData.filter((d) => isExpired(d)).slice(0, 3);
        setDocs([...active, ...expired]);
        setBio(bioData[0] || null);
        setVehicles(vehData);
        setEvents(evs);
        const ins = await getInsuranceStatus(person);
        setInsurance(ins);
      } catch {}
      setLoading(false);
    })();
  }, [person]);

  const VEHICLE_FIELDS = [
    { name: 'brand', label: 'Marca', type: 'text', required: true, placeholder: 'Ej: Ford' },
    { name: 'model', label: 'Modelo', type: 'text', required: true, placeholder: 'Ej: Fiesta' },
    { name: 'plate', label: 'Patente', type: 'text', required: true, placeholder: 'Ej: AB123CD' },
    { name: 'color', label: 'Color', type: 'text', placeholder: 'Ej: Blanco' },
    {
      name: 'event_ids', label: 'Eventos asignados', type: 'toggle-group',
      options: events.filter((e) => e.status !== 'closed').map((e) => ({ value: e.id, label: e.name })),
      full: true,
    },
    {
      name: 'parking_sector', label: 'Sector de estacionamiento', type: 'select',
      options: sectors.map((s) => ({ value: s.value, label: s.label })),
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Vehículo de carga' },
  ];

  const openNewVehicle = () => { setEditingVehicle(null); setVehicleModalOpen(true); };
  const openEditVehicle = (v) => { setEditingVehicle(v); setVehicleModalOpen(true); };

  const handleVehicleSubmit = async (data) => {
    const selectedEventIds = data.event_ids ? String(data.event_ids).split(',').filter(Boolean) : [];
    const enriched = {
      ...data,
      person_id: person.id,
      person_name: person.full_name,
      company: events.find((e) => e.id === selectedEventIds[0])?.company || editingVehicle?.company || '',
      plate: (data.plate || '').toUpperCase().trim(),
      event_ids: selectedEventIds,
      event_names: selectedEventIds.map((id) => events.find((e) => e.id === id)?.name).filter(Boolean),
    };
    if (editingVehicle) {
      await base44.entities.Vehicle.update(editingVehicle.id, enriched);
    } else {
      await base44.entities.Vehicle.create(enriched);
    }
    await loadVehicles(person.id);
  };

  const handleVehicleDelete = async () => {
    await base44.entities.Vehicle.delete(editingVehicle.id);
    await loadVehicles(person.id);
  };

  const handleDeleteDoc = async (doc) => {
    if (!confirm(`¿Eliminar el documento "${doc.original_name}"?`)) return;
    try {
      await base44.entities.Document.delete(doc.id);
      await loadDocs(person.id);
    } catch (err) {
      alert('Error al eliminar: ' + (err.message || err));
    }
  };

  const openReview = (doc, action) => {
    setReviewingDoc(doc);
    setReviewAction(action);
    setReviewNote('');
    setReviewExpiresAt(doc.expires_at ? doc.expires_at.split('T')[0] : '');
  };

  const handleReview = async () => {
    if (!reviewingDoc) return;
    setSavingReview(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.Document.update(reviewingDoc.id, {
        status: reviewAction,
        review_note: reviewNote || '',
        expires_at: reviewAction === 'approved' ? (reviewExpiresAt || null) : (reviewingDoc.expires_at || null),
        reviewed_by: me?.full_name || me?.email || 'Sistema',
        reviewed_at: new Date().toISOString(),
      });
      setReviewingDoc(null);
      setReviewNote('');
      setReviewExpiresAt('');
      await loadDocs(person.id);
    } catch (err) {
      alert('Error al revisar el documento: ' + (err.message || err));
    } finally {
      setSavingReview(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !docType) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
      await base44.entities.Document.create({
        person_id: person.id,
        person_name: person.full_name,
        event_id: person.event_id,
        company: person.productora || person.company || '',
        document_type: docType,
        original_name: selectedFile.name,
        file_url,
        mime_type: selectedFile.type,
        size: selectedFile.size,
        status: 'pending',
      });
      setSelectedFile(null);
      setDocType('work_insurance');
      await loadDocs(person.id);
    } catch (err) {
      alert('Error al subir el documento: ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  if (!person) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">DOCUMENTACIÓN</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{person.full_name}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{person.document || 'Sin documento'} · {person.company || 'Sin empresa'}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {person.employment_type && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${person.employment_type === 'eventual' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                  {person.employment_type === 'eventual' ? 'Eventual' : 'Fijo'}
                </span>
              )}
              {person.event_phases?.map((p) => (
                <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {{ armado: 'Armado', dia_evento: 'Show', desarme: 'Desarme' }[p] || p}
                </span>
              ))}
              {person.access_area && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 capitalize">
                  {person.access_area}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          {/* Face photo */}
          <div className="mb-5 flex items-center gap-4">
            {loading ? (
              <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-100">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : bio?.face_photo_url ? (
              <Image src={bio.face_photo_url} alt={person.full_name} className="h-20 w-20 rounded-xl object-cover" fittingType="fill" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-100 text-slate-300">
                <User className="h-8 w-8" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rostro registrado</p>
              {bio?.face_photo_url ? (
                <p className="mt-0.5 text-sm text-emerald-600">✓ Biometría activa</p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-400">Sin biometría registrada</p>
              )}
            </div>
            {!loading && !readOnly && (
              <button
                onClick={() => setDniBioOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <ScanFace className="h-3.5 w-3.5" /> DNI → Bio
              </button>
            )}
          </div>

          {/* Insurance status */}
          {!loading && insurance && (
            <div className={`mb-5 flex items-center gap-3 rounded-xl border p-3.5 ${insurance.insured ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
              {insurance.insured ? (
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-bold ${insurance.insured ? 'text-emerald-800' : 'text-red-800'}`}>
                  {insurance.insured ? 'Seguro aprobado' : 'Sin seguro aprobado'}
                </p>
                <p className="text-xs text-slate-500">
                  {insurance.insured
                    ? `La persona puede ser acreditada.${insurance.approvedDoc?.expires_at ? ` Vence: ${new Date(insurance.approvedDoc.expires_at + 'T00:00:00').toLocaleDateString('es-AR')}.` : ''}`
                    : 'No se puede acreditar hasta que la empresa o la persona tenga un seguro aprobado.'}
                </p>
              </div>
            </div>
          )}

          {/* Custom fields */}
          {!loading && customFields.length > 0 && person.custom_fields && Object.keys(person.custom_fields).length > 0 && (
            <>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Campos personalizados</p>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {customFields.map((cf) => {
                  const val = person.custom_fields?.[cf.field_key];
                  if (val === undefined || val === null || val === '') return null;
                  const display = cf.field_type === 'boolean' ? (val ? 'Sí' : 'No') : String(val);
                  return (
                    <div key={cf.id} className="rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{cf.field_label}</p>
                      <p className="mt-0.5 text-sm text-slate-900">{display}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Emergency & medical info */}
          {!loading && (person.obra_social || person.carnet_obra_social || person.emergency_contact_name || person.emergency_contact_phone || person.allergies || person.blood_type || person.coordinator_name) && (
            <>
              <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-500">
                <Heart className="h-3.5 w-3.5" /> Ficha médica y de emergencia
              </p>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {person.blood_type && (
                  <div className="rounded-lg border border-red-200 bg-red-50/30 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Grupo sanguíneo</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{person.blood_type}</p>
                  </div>
                )}
                {person.allergies && (
                  <div className="rounded-lg border border-red-200 bg-red-50/30 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Alergias</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{person.allergies}</p>
                  </div>
                )}
                {person.obra_social && (
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Obra social</p>
                    <p className="mt-0.5 text-sm text-slate-900">{person.obra_social}</p>
                    {person.carnet_obra_social && <p className="text-xs text-slate-500">Carnet: {person.carnet_obra_social}</p>}
                  </div>
                )}
                {person.emergency_contact_name && (
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contacto de emergencia</p>
                    <p className="mt-0.5 text-sm text-slate-900">{person.emergency_contact_name}</p>
                    {person.emergency_contact_phone && <p className="text-xs text-slate-500">{person.emergency_contact_phone}</p>}
                  </div>
                )}
                {person.coordinator_name && (
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Coordinador</p>
                    <p className="mt-0.5 text-sm text-slate-900">{person.coordinator_name}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Documents */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Documentación</p>
          <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Esta persona no subió documentación.</p>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-slate-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{docTypes.find((t) => t.value === doc.document_type)?.label || doc.document_type}</p>
                    <p className="text-xs text-slate-400">{doc.original_name}</p>
                    {doc.expires_at && (
                      <p className={`mt-0.5 text-xs ${isExpired(doc) ? 'text-red-600' : 'text-slate-500'}`}>
                        Vence: {new Date(doc.expires_at + 'T00:00:00').toLocaleDateString('es-AR')}
                      </p>
                    )}
                    {doc.review_note && <p className="mt-0.5 text-xs text-slate-500">Nota: {doc.review_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={isExpired(doc) ? 'expired' : doc.status} />
                  {doc.file_url && (
                    <button onClick={() => setViewingDoc(doc)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50" title="Ver archivo">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {doc.status === 'pending' && !readOnly && (
                    <>
                      <button onClick={() => openReview(doc, 'approved')} className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 transition hover:bg-emerald-100" title="Aprobar">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openReview(doc, 'rejected')} className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-700 transition hover:bg-red-100" title="Rechazar">
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {!readOnly && (
                    <button onClick={() => handleDeleteDoc(doc)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          </div>

          {/* Upload from backend */}
          {!loading && !readOnly && (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Subir documentación</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  {docTypes.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
                <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  <UploadCloud className="h-4 w-4" />
                  {selectedFile ? selectedFile.name : 'Elegir archivo…'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </label>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Subir
                </button>
              </div>
            </div>
          )}

          {/* Vehicles */}
          {!loading && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vehículos asignados</p>
                {!readOnly && (
                  <button onClick={openNewVehicle}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">
                    <Plus className="h-3 w-3" /> Agregar
                  </button>
                )}
              </div>
              {vehicles.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Sin vehículos asignados.</p>
              ) : (
                <div className="space-y-2">
                  {vehicles.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-slate-400">
                          <Car className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{v.brand} {v.model}</p>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              {v.plate}
                            </span>
                            {v.color && <span className="text-xs text-slate-400">{v.color}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {v.parking_sector && (
                          <span className="mr-1 inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            {sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector}
                          </span>
                        )}
                        <button onClick={() => setPrintingVehicle(v)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700" title="Imprimir credencial">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {!readOnly && (
                          <button onClick={() => openEditVehicle(v)}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EntityModal
        open={vehicleModalOpen}
        onClose={() => setVehicleModalOpen(false)}
        title={editingVehicle ? 'Editar vehículo' : 'Nuevo vehículo'}
        kicker={editingVehicle ? 'EDITAR VEHÍCULO' : 'CREAR VEHÍCULO'}
        fields={VEHICLE_FIELDS}
        initialData={editingVehicle || {}}
        onSubmit={handleVehicleSubmit}
        onDelete={editingVehicle ? handleVehicleDelete : null}
        canDelete={!!editingVehicle}
        submitLabel={editingVehicle ? 'Guardar cambios' : 'Crear vehículo'}
      />

      <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />

      {/* Review modal */}
      {reviewingDoc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !savingReview && setReviewingDoc(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {reviewAction === 'approved' ? 'Aprobar documento' : 'Rechazar documento'}
                </h3>
                <p className="text-xs text-slate-500">{reviewingDoc.original_name}</p>
              </div>
              <button onClick={() => setReviewingDoc(null)} disabled={savingReview} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {reviewAction === 'approved' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Fecha de vencimiento</label>
                  <input
                    type="date"
                    value={reviewExpiresAt}
                    onChange={(e) => setReviewExpiresAt(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Nota de revisión (opcional)</label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder={reviewAction === 'approved' ? 'Ej: Documento verificado correctamente.' : 'Ej: Documento ilegible, volver a subir.'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setReviewingDoc(null)} disabled={savingReview}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleReview} disabled={savingReview}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50 ${reviewAction === 'approved' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-red-600 hover:bg-red-700'}`}>
                {savingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : (reviewAction === 'approved' ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />)}
                {reviewAction === 'approved' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {printingVehicle && (
        <VehicleBadgePrint
          vehicle={printingVehicle}
          events={events.filter((e) => printingVehicle.event_ids?.includes(e.id))}
          parkingSectors={sectors}
          onClose={() => setPrintingVehicle(null)}
        />
      )}

      {dniBioOpen && (
        <DniToBiometric
          person={person}
          onSaved={async () => {
            const bioData = await base44.entities.Biometric.filter({ person_id: person.id, status: 'active' }, '-created_date', 1);
            setBio(bioData[0] || null);
          }}
          onClose={() => setDniBioOpen(false)}
        />
      )}
    </div>
  );
}