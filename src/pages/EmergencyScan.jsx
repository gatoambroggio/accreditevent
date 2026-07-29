import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ScanFace, AlertTriangle, Heart, Building2, Phone, ShieldCheck, Droplet, User, AlertCircle, RotateCcw, FileText, Car } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import PageHeader from '@/components/ui/page-header';
import FilterSelect from '@/components/ui/filter-select';
import StatusBadge from '@/components/StatusBadge';

export default function EmergencyScan() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [scanKey, setScanKey] = useState(0);

  useEffect(() => {
    base44.entities.Event.list('-start_at', 100).then(setEvents).catch(() => {});
  }, []);

  const handleScan = async (file) => {
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('faceIdentify', {
        captured_photo_url: file_url,
        event_id: selectedEventId || null,
      });
      if (res.data?.verified && res.data?.accred?.person_id) {
        const [person, docs, vehicles] = await Promise.all([
          base44.entities.Person.get(res.data.accred.person_id),
          base44.entities.Document.filter({ person_id: res.data.accred.person_id }, '-created_date', 50),
          base44.entities.Vehicle.filter({ person_id: res.data.accred.person_id }, '-created_date', 10),
        ]);
        setResult({ person, docs, vehicles, accred: res.data.accred });
      } else {
        setError(res.data?.message || 'No se identificó a la persona.');
      }
    } catch (err) {
      setError(err.message || 'Error al escanear.');
    } finally {
      setScanning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError('');
    setScanKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Emergencias" title="Escaneo de emergencia">
        <FilterSelect
          value={selectedEventId}
          onChange={setSelectedEventId}
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Todos los eventos"
        />
      </PageHeader>

      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-bold text-red-800">Modo de emergencia</p>
            <p className="mt-0.5 text-sm text-red-700">
              Escaneá el rostro de la persona para ver de forma inmediata su empresa, seguro, obra social, alergias, grupo sanguíneo y contacto de emergencia.
            </p>
          </div>
        </div>
      </div>

      {!result && !scanning && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ScanFace className="h-5 w-5 text-emerald-600" /> Capturá el rostro
          </div>
          <p className="mt-1 text-sm text-slate-500">La cámara se abrirá para identificar a la persona acreditada.</p>
          <div className="mt-5">
            <FaceCapture key={scanKey} onCaptured={handleScan} label="Abrir cámara" autoCapture />
          </div>
        </div>
      )}

      {scanning && (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="ml-3 text-sm font-medium text-slate-600">Identificando persona…</span>
        </div>
      )}

      {error && !result && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">{error}</p>
            <button onClick={reset} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              <RotateCcw className="h-4 w-4" /> Reintentar
            </button>
          </div>
        </div>
      )}

      {result && (
        <EmergencyCard
          person={result.person}
          accred={result.accred}
          docs={result.docs}
          vehicles={result.vehicles}
          onReset={reset}
        />
      )}
    </div>
  );
}

function EmergencyCard({ person, accred, docs, vehicles, onReset }) {
  const insuranceDocs = docs.filter((d) => ['work_insurance', 'art', 'seguro'].includes(d.document_type));
  const otherDocs = docs.filter((d) => !['work_insurance', 'art', 'seguro'].includes(d.document_type));

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-lg">
        <div className="bg-red-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-red-200">Ficha de emergencia</p>
                <h2 className="text-xl font-bold">{person.full_name}</h2>
              </div>
            </div>
            <button onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/25">
              <RotateCcw className="h-4 w-4" /> Nuevo escaneo
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
          <InfoCell icon={Building2} label="Empresa" value={person.company || accred.company || '—'} accent />
          <InfoCell icon={ShieldCheck} label="Seguro / Póliza" value={
            insuranceDocs.length > 0
              ? insuranceDocs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span>{d.original_name}</span>
                    <StatusBadge status={d.status} />
                  </div>
                ))
              : 'Sin seguro cargado'
          } />
          <InfoCell icon={Heart} label="Obra social" value={person.obra_social || '—'} sub={person.carnet_obra_social ? `Carnet: ${person.carnet_obra_social}` : ''} />
          <InfoCell icon={Droplet} label="Grupo sanguíneo" value={person.blood_type || '—'} accent />
          <InfoCell icon={AlertCircle} label="Alergias a medicamentos" value={person.allergies || 'Sin alergias registradas'} danger={!!person.allergies} />
          <InfoCell icon={User} label="Coordinador asignado" value={person.coordinator_name || '—'} />
          <InfoCell icon={Phone} label="Contacto de emergencia" value={
            person.emergency_contact_name || person.emergency_contact_phone
              ? `${person.emergency_contact_name || ''}${person.emergency_contact_phone ? ` · ${person.emergency_contact_phone}` : ''}`
              : '—'
          } accent={!!person.emergency_contact_phone} />
          <InfoCell icon={Phone} label="Teléfono del empleado" value={person.phone || '—'} />
        </div>

        {vehicles.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Car className="h-4 w-4" /> Vehículos vinculados
            </p>
            <div className="space-y-1.5">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">{v.plate}</span>
                  <span className="text-slate-700">{v.brand} {v.model}</span>
                  {v.color && <span className="text-xs text-slate-400">{v.color}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({ icon: Icon, label, value, sub, accent, danger }) {
  return (
    <div className={`bg-white px-6 py-4 ${accent ? 'bg-emerald-50/30' : ''} ${danger ? 'bg-red-50/40' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-slate-900">
        {Array.isArray(value) ? <div className="space-y-1">{value}</div> : value}
      </div>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}