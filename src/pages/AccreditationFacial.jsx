import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Calendar, AlertCircle, RefreshCw, Printer } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import BadgePrint from '@/components/BadgePrint';
import FacialAccreditationForm from '@/components/FacialAccreditationForm';
import BatchVehicleBadgePrint from '@/components/BatchVehicleBadgePrint';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { findBestMatch } from '@/lib/faceRecognition';

export default function AccreditationFacial() {
  const [phase, setPhase] = useState('select');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [cycle, setCycle] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [printAccred, setPrintAccred] = useState(null);
  const [people, setPeople] = useState([]);
  const [pendingPerson, setPendingPerson] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [vehicleBatchPrint, setVehicleBatchPrint] = useState(null);
  const { sectors } = useParkingSectors();

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.filter({ status: 'active' }, '-created_date', 100);
        setEvents(data);
        const ps = await base44.entities.Person.list('-created_date', 200);
        setPeople(ps);
        const sts = await base44.entities.SystemSetting.list('-created_date', 1);
        setSettings(sts[0] || null);
      } catch {}
      setLoadingEvents(false);
    })();
  }, []);

  const startStation = () => {
    const evt = events.find((e) => e.id === selectedEventId);
    if (!evt) return;
    setSelectedEvent(evt);
    setPhase('active');
    setCycle((c) => c + 1);
    setResult(null);
  };

  const reset = () => {
    setResult(null);
    setProcessing(false);
    setCycle((c) => c + 1);
  };

  const backToSelect = () => {
    setPhase('select');
    setSelectedEvent(null);
    setSelectedEventId('');
    setResult(null);
    setProcessing(false);
  };

  const handleCaptured = async (file, descriptor) => {
    setProcessing(true);
    setResult(null);
    try {
      if (!descriptor) {
        setResult({ ok: false, message: 'No se detectó un rostro humano en la captura.' });
        return;
      }

      const allPersons = await base44.entities.Person.list('-created_date', 500);
      const eventPersonIds = new Set(
        allPersons
          .filter((p) => p.event_id === selectedEvent.id || (Array.isArray(p.event_ids) && p.event_ids.includes(selectedEvent.id)))
          .map((p) => p.id)
      );
      const bios = await base44.entities.Biometric.filter({ status: 'active' }, '-created_date', 500);
      const withDescriptors = bios.filter(
        (b) => b.face_descriptor && b.face_descriptor.length > 0 && eventPersonIds.has(b.person_id)
      );
      if (withDescriptors.length === 0) {
        setResult({ ok: false, message: 'No hay rostros registrados en el sistema.' });
        return;
      }

      const { match, distance } = findBestMatch(descriptor, withDescriptors);
      if (!match) {
        setResult({ ok: false, message: `No se encontró coincidencia facial (distancia: ${distance.toFixed(2)}).` });
        return;
      }

      const personId = match.person_id;
      const personName = match.person_name || 'Persona';

      const existing = await base44.entities.Accreditation.filter(
        { event_id: selectedEvent.id, person_id: personId },
        '-created_date',
        5
      );
      if (existing.length > 0) {
        const accred = existing[0];
        setResult({
          ok: false,
          alreadyAccredited: true,
          person_name: accred.person_name,
          badge_code: accred.badge_code,
          message: 'Esta persona ya tiene una acreditación para este evento.',
        });
        return;
      }

      let person = null;
      try {
        person = await base44.entities.Person.get(personId);
      } catch {}

      // Block accreditation if the person has pending/rejected/expired documentation
      const docCheck = await base44.functions.invoke('checkPersonDocuments', { person_id: personId, event_id: selectedEvent.id });
      if (docCheck.data?.has_pending) {
        setResult({
          ok: false,
          person_name: personName,
          message: `No se puede acreditar: documentación pendiente o vencida (${docCheck.data.pending_statuses.join(', ')}).`,
        });
        return;
      }

      // Asegurar que la persona identificada esté en la lista para el formulario
      if (person) {
        setPeople((prev) => prev.some((p) => p.id === person.id) ? prev : [person, ...prev]);
      }

      // Abrir formulario completo (como nueva acreditación manual) con la persona identificada
      setResult({
        ok: 'identified',
        person_name: personName,
        face_photo_url: match.face_photo_url,
      });
      setPendingPerson({
        ...(person || {}),
        id: personId,
        full_name: person?.full_name || personName,
        face_photo_url: match.face_photo_url,
      });
      setFormOpen(true);
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Error en el proceso.' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Acreditación física</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Acreditación facial</h1>
      </div>

      {phase === 'select' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Seleccionar evento</h2>
              <p className="text-sm text-slate-500">Elegí el evento para acreditar personas por reconocimiento facial.</p>
            </div>
          </div>

          {loadingEvents ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : events.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No hay eventos registrados.</p>
          ) : (
            <>
              <div className="space-y-2">
                {events.map((evt) => {
                  const isSelected = selectedEventId === evt.id;
                  return (
                    <button
                      key={evt.id}
                      onClick={() => setSelectedEventId(evt.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <p className="font-bold text-slate-900">{evt.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{evt.venue || 'Sin sede'}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {evt.start_at ? new Date(evt.start_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}
                      </p>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={startStation}
                disabled={!selectedEventId}
                className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
              >
                Iniciar acreditación facial
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'active' && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div>
              <p className="text-sm font-bold text-slate-900">{selectedEvent.name}</p>
              <p className="text-xs text-slate-500">{selectedEvent.venue || 'Sin sede'}</p>
            </div>
            <button onClick={backToSelect} className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Cambiar evento
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {processing ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                <span className="mt-3 text-sm text-slate-500">Procesando…</span>
              </div>
            ) : result ? (
              <div className="flex flex-col items-center py-8">
                {result.ok === 'identified' ? (
                  <>
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-blue-100">
                      <CheckCircle2 className="h-10 w-10 text-blue-600" />
                    </div>
                    <p className="mt-4 text-xl font-bold text-slate-900">Rostro identificado</p>
                    <p className="mt-1 text-lg text-slate-600">{result.person_name}</p>
                    {result.face_photo_url && (
                      <img src={result.face_photo_url} alt="Rostro" className="mt-3 h-20 w-20 rounded-lg object-cover" />
                    )}
                    <p className="mt-3 max-w-sm text-center text-xs text-slate-500">
                      Revisá los datos en el formulario y confirmá para generar la acreditación.
                    </p>
                  </>
                ) : result.ok ? (
                  <>
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                    </div>
                    <p className="mt-4 text-2xl font-extrabold text-slate-900">Acreditación generada</p>
                    <p className="mt-1 text-lg text-slate-600">{result.person_name}</p>
                    <div className="mt-3 rounded-lg bg-slate-100 px-4 py-2">
                      <code className="text-lg font-bold text-slate-900">{result.badge_code}</code>
                    </div>
                    <button
                      onClick={() => setPrintAccred(result.accred)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4" /> Imprimir credencial
                    </button>
                  </>
                ) : result.alreadyAccredited ? (
                  <>
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-amber-100">
                      <AlertCircle className="h-10 w-10 text-amber-600" />
                    </div>
                    <p className="mt-4 text-xl font-bold text-slate-900">Ya acreditado</p>
                    <p className="mt-1 text-slate-600">{result.person_name}</p>
                    <div className="mt-3 rounded-lg bg-slate-100 px-4 py-2">
                      <code className="text-sm font-bold text-slate-900">{result.badge_code}</code>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{result.message}</p>
                  </>
                ) : (
                  <>
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-red-100">
                      <XCircle className="h-10 w-10 text-red-600" />
                    </div>
                    <p className="mt-4 text-xl font-bold text-slate-900">No se pudo acreditar</p>
                    <p className="mt-1 max-w-sm text-center text-sm text-slate-500">{result.message}</p>
                  </>
                )}
                <button
                  onClick={reset}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                >
                  <RefreshCw className="h-4 w-4" /> Acreditar otra persona
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 text-lg font-bold text-slate-900">Identificación facial</h2>
                <p className="mb-5 text-sm text-slate-500">
                  Mirá a la cámara. El sistema identificará tu rostro y abrirá la pre-acreditación para que confirmes.
                </p>
                <FaceCapture key={cycle} onCaptured={handleCaptured} autoCapture />
              </>
            )}
          </div>
        </div>
      )}

      {printAccred && (
        <BadgePrint
          accreditation={printAccred}
          event={selectedEvent}
          onClose={() => setPrintAccred(null)}
        />
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

      <FacialAccreditationForm
        open={formOpen}
        event={selectedEvent}
        identifiedPerson={pendingPerson}
        events={events}
        people={people}
        onCreated={(accred, printInfo) => {
          setFormOpen(false);
          setPendingPerson(null);
          setResult({
            ok: true,
            person_name: accred.person_name,
            badge_code: accred.badge_code,
            accred,
          });
          if (printInfo?.personal) setPrintAccred(accred);
          if (printInfo?.vehicles?.length) {
            setVehicleBatchPrint({ vehicles: printInfo.vehicles, event: selectedEvent });
          }
        }}
        onClose={() => {
          setFormOpen(false);
          setPendingPerson(null);
          reset();
        }}
      />
    </div>
  );
}