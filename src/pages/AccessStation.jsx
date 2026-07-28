import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { loadModels, getFaceDescriptor, findBestMatch } from '@/lib/faceRecognition';
import { isWithinEventPhases, speakResult, getEventStatus, EVENT_STATUS_INFO } from '@/lib/accessUtils';
import { canAccessZone } from '@/lib/accessZones';
import { CheckCircle2, XCircle, Camera, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';

export default function AccessStation() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [biometrics, setBiometrics] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [zone, setZone] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    base44.entities.Event.filter({ status: 'active' }, '-created_date', 50).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      Promise.all([
        base44.entities.Biometric.filter({ event_id: selectedEvent.id, status: 'active' }, '-created_date', 500),
        base44.entities.Accreditation.filter({ event_id: selectedEvent.id, status: 'active' }, '-created_date', 500),
      ]).then(([bios, accs]) => {
        setBiometrics(bios);
        setAccreditations(accs);
      }).catch(() => {});
    }
  }, [selectedEvent]);

  const startCamera = async () => {
    setLoadingModels(true);
    try {
      await loadModels();
      setModelsReady(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      scanLoop();
    } catch (err) {
      setResult({ ok: false, message: 'No se pudo acceder a la cámara.' });
    }
    setLoadingModels(false);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const scanLoop = async () => {
    if (!videoRef.current || !streamRef.current) return;
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (descriptor) {
        const { match, distance } = findBestMatch(descriptor, biometrics);
        if (match) {
          await processAccess(match);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } catch {}
    if (streamRef.current) {
      requestAnimationFrame(scanLoop);
    }
  };

  const processAccess = async (biometric) => {
    const accreditation = accreditations.find((a) => a.person_id === biometric.person_id);
    if (!accreditation) {
      setResult({ ok: false, message: 'Sin acreditación activa', name: biometric.person_name });
      speakResult(false);
      logAccess(biometric, 'denied', 'Sin acreditación');
      return;
    }
    if (accreditation.status !== 'active') {
      setResult({ ok: false, message: 'Acreditación bloqueada', name: biometric.person_name });
      speakResult(false);
      logAccess(biometric, 'denied', 'Acreditación ' + accreditation.status);
      return;
    }
    if (zone && !canAccessZone(accreditation.access_level, zone)) {
      setResult({ ok: false, message: `Área ${accreditation.access_level} no autorizada para zona ${zone}`, name: biometric.person_name });
      speakResult(false);
      logAccess(biometric, 'denied', 'Zona no autorizada');
      return;
    }
    if (!isWithinEventPhases(selectedEvent, accreditation.event_phases)) {
      setResult({ ok: false, message: 'Fuera del rango horario de la fase', name: biometric.person_name });
      speakResult(false);
      logAccess(biometric, 'denied', 'Fuera de fase');
      return;
    }
    setResult({ ok: true, message: 'Acceso permitido', name: biometric.person_name, area: accreditation.access_level });
    speakResult(true);
    logAccess(biometric, 'granted');
  };

  const logAccess = async (biometric, result, detail = '') => {
    try {
      const accreditation = accreditations.find((a) => a.person_id === biometric.person_id);
      await base44.entities.AccessLog.create({
        accreditation_id: accreditation?.id || '',
        person_name: biometric.person_name || '',
        badge_code: accreditation?.badge_code || '',
        event_id: selectedEvent.id,
        event_name: selectedEvent.name,
        company: selectedEvent.company,
        method: 'biometric',
        resource_type: 'person',
        zone: zone || '',
        result,
        access_level: accreditation?.access_level || '',
      });
    } catch {}
  };

  useEffect(() => () => stopCamera(), []);

  if (!selectedEvent) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Reconocimiento facial</h1>
          <p className="mt-1 text-sm text-slate-500">Seleccioná el evento para iniciar la estación.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((ev) => {
            const status = getEventStatus(ev);
            const info = EVENT_STATUS_INFO[status];
            return (
              <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                <p className="font-bold text-slate-900">{ev.name}</p>
                <p className="mt-1 text-xs text-slate-400">{ev.venue || 'Sin sede'}</p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${info.cls}`}>{info.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950">
      {result && (
        <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600/95' : 'bg-red-600/95'}`}>
          {result.ok ? <CheckCircle2 className="h-32 w-32 text-white" /> : <XCircle className="h-32 w-32 text-white" />}
          <p className="mt-6 text-4xl font-extrabold text-white">{result.message}</p>
          {result.name && <p className="mt-2 text-xl text-white/80">{result.name}</p>}
          {result.area && <p className="mt-1 text-lg text-white/60">Área: {result.area}</p>}
        </div>
      )}

      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4">
          <button onClick={() => { stopCamera(); setSelectedEvent(null); setResult(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            <ArrowLeft className="h-4 w-4" /> Cambiar evento
          </button>
          <div className="text-center">
            <p className="font-bold text-white">{selectedEvent.name}</p>
            <p className="text-xs text-slate-400">Reconocimiento facial</p>
          </div>
          <select value={zone} onChange={(e) => setZone(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none">
            <option value="">Todas las zonas</option>
            <option value="general">General</option>
            <option value="backstage">Backstage</option>
            <option value="technical">Técnica</option>
            <option value="vip">VIP</option>
            <option value="all-access">All Access</option>
          </select>
        </div>

        <div className="relative flex-1">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80">
              {loadingModels ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
                  <p className="mt-4 text-sm text-slate-300">Cargando modelos de reconocimiento…</p>
                </>
              ) : (
                <>
                  <Camera className="h-16 w-16 text-slate-400" />
                  <p className="mt-4 text-sm text-slate-300">Cámara lista para iniciar</p>
                  <button onClick={startCamera}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">
                    <Camera className="h-5 w-5" /> Iniciar escaneo
                  </button>
                </>
              )}
            </div>
          )}
          {scanning && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center pb-8">
              <div className="rounded-full bg-emerald-500/20 px-6 py-2 text-sm font-semibold text-emerald-300 backdrop-blur">
                {biometrics.length} biometrías activas · Escaneando…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}