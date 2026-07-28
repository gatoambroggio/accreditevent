import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { ScanFace, CheckCircle2, Search } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FaceCapture from '@/components/FaceCapture';
import { useZones } from '@/lib/useZones';
import { loadModels, getFaceDescriptor, compareDescriptors, MATCH_THRESHOLD } from '@/lib/faceRecognition';

export default function AccreditationFacial() {
  const [accreditations, setAccreditations] = useState([]);
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [target, setTarget] = useState(null);
  const [capturedFile, setCapturedFile] = useState(null);
  const [capturedDescriptor, setCapturedDescriptor] = useState(null);
  const [saving, setSaving] = useState(false);
  const { zones } = useZones();

  useEffect(() => {
    Promise.all([
      base44.entities.Accreditation.list('-created_date', 200),
      base44.entities.Event.list('-created_date', 100),
    ]).then(([accs, evs]) => { setAccreditations(accs); setEvents(evs); }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return accreditations.filter((a) => {
      if (eventFilter && a.event_id !== eventFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.person_name?.toLowerCase().includes(q) || a.badge_code?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [accreditations, search, eventFilter]);

  const handleCapture = async (file, descriptor) => {
    if (!descriptor) {
      alert('No se detectó un rostro.');
      return;
    }
    setCapturedFile(file);
    setCapturedDescriptor(descriptor);
  };

  const handleSave = async () => {
    if (!target || !capturedDescriptor || !capturedFile) return;
    setSaving(true);
    try {
      const { file_url: photoUrl } = await base44.integrations.Core.UploadFile({ file: capturedFile });
      await base44.entities.Biometric.create({
        accreditation_id: target.id,
        person_id: target.person_id,
        person_name: target.person_name,
        event_id: target.event_id,
        company: target.company,
        face_photo_url: photoUrl,
        face_descriptor: Array.from(capturedDescriptor),
        status: 'active',
      });
      // Update accreditation
      await base44.entities.Accreditation.update(target.id, { has_biometric: true });
      setTarget(null);
      setCapturedFile(null);
      setCapturedDescriptor(null);
      // Refresh
      const accs = await base44.entities.Accreditation.list('-created_date', 200);
      setAccreditations(accs);
    } catch (err) {
      alert('No se pudo guardar la biometría.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Biometría" title="Acreditación facial" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar persona o código…" />
        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
          <option value="">Todos los eventos</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{a.person_name}</p>
                <p className="text-xs text-slate-400">{a.badge_code} · {a.event_name}</p>
              </div>
              {a.has_biometric ? (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              ) : (
                <button onClick={() => { setTarget(a); setCapturedFile(null); setCapturedDescriptor(null); }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600">
                  <ScanFace className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-xl font-bold text-slate-900">Captura facial</h2>
            <p className="mb-4 text-sm text-slate-500">{target.person_name} · {target.badge_code}</p>
            {capturedDescriptor ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                  <p className="mt-2 text-sm font-medium text-emerald-700">Rostro capturado correctamente</p>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setCapturedFile(null); setCapturedDescriptor(null); }} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                    Recapturar
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                    {saving ? 'Guardando…' : 'Guardar biometría'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <FaceCapture onCaptured={handleCapture} />
                <button onClick={() => setTarget(null)} className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}