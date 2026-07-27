import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Loader2, FileText, ExternalLink, User, UploadCloud, Car, Plus, Pencil, Trash2 } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Image } from '@/components/ui/image';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import DocumentViewer from '@/components/DocumentViewer';
import EntityModal from '@/components/EntityModal';

export default function PersonDetailModal({ person, onClose }) {
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
  const { docTypes } = useDocumentTypes();

  const loadDocs = async (personId) => {
    const docData = await base44.entities.Document.filter({ person_id: personId }, '-created_date', 100);
    setDocs(docData);
  };

  const loadVehicles = async (personId) => {
    const vehData = await base44.entities.Vehicle.filter({ person_id: personId }, '-created_date', 50);
    setVehicles(vehData);
  };

  useEffect(() => {
    if (!person) return;
    (async () => {
      try {
        const [docData, bioData, vehData] = await Promise.all([
          base44.entities.Document.filter({ person_id: person.id }, '-created_date', 100),
          base44.entities.Biometric.filter({ person_id: person.id, status: 'active' }, '-created_date', 1),
          base44.entities.Vehicle.filter({ person_id: person.id }, '-created_date', 50),
        ]);
        setDocs(docData);
        setBio(bioData[0] || null);
        setVehicles(vehData);
      } catch {}
      setLoading(false);
    })();
  }, [person]);

  const VEHICLE_FIELDS = [
    { name: 'brand', label: 'Marca', type: 'text', required: true, placeholder: 'Ej: Ford' },
    { name: 'model', label: 'Modelo', type: 'text', required: true, placeholder: 'Ej: Fiesta' },
    { name: 'plate', label: 'Patente', type: 'text', required: true, placeholder: 'Ej: AB123CD' },
    { name: 'color', label: 'Color', type: 'text', placeholder: 'Ej: Blanco' },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Vehículo de carga' },
  ];

  const openNewVehicle = () => { setEditingVehicle(null); setVehicleModalOpen(true); };
  const openEditVehicle = (v) => { setEditingVehicle(v); setVehicleModalOpen(true); };

  const handleVehicleSubmit = async (data) => {
    const enriched = {
      ...data,
      person_id: person.id,
      person_name: person.full_name,
      plate: (data.plate || '').toUpperCase().trim(),
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

  const handleUpload = async () => {
    if (!selectedFile || !docType) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
      await base44.entities.Document.create({
        person_id: person.id,
        person_name: person.full_name,
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rostro registrado</p>
              {bio?.face_photo_url ? (
                <p className="mt-0.5 text-sm text-emerald-600">✓ Biometría activa</p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-400">Sin biometría registrada</p>
              )}
            </div>
          </div>

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
                    {doc.review_note && <p className="mt-0.5 text-xs text-slate-500">Nota: {doc.review_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.file_url && (
                    <button onClick={() => setViewingDoc(doc)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50" title="Ver archivo">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          </div>

          {/* Upload from backend */}
          {!loading && (
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
                <button onClick={openNewVehicle}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">
                  <Plus className="h-3 w-3" /> Agregar
                </button>
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
                        <button onClick={() => openEditVehicle(v)}
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
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
    </div>
  );
}