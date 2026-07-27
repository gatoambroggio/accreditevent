import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Calendar, Clock, AlertTriangle, Car, User } from 'lucide-react';
import QrScanner from '@/components/QrScanner';
import { canAccessAnyZone } from '@/lib/accessZones';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';

function getEventStatus(event) {
  const now = Date.now();
  const start = event.start_at ? new Date(event.start_at).getTime() : 0;
  const end = event.end_at ? new Date(event.end_at).getTime() : 0;
  const grace = (event.grace_hours ?? 4) * 3600000;
  const graceEnd = end + grace;

  if (start && now < start) return 'upcoming';
  if (end && now > graceEnd) return 'ended';
  if (end && now > end) return 'grace';
  return 'active';
}

const STATUS_INFO = {
  upcoming: { label: 'Próximo a iniciar', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'En curso', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  grace: { label: 'Período de gracia', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  ended: { label: 'Finalizado', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export default function AccessQrStation({ mode = 'person' }) {
  const [phase, setPhase] = useState('select');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedZones, setSelectedZones] = useState(['general']);
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [cycle, setCycle] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const qrCooldown = useRef(false);
  const { zones } = useZones();
  const { sectors: parkingSectors } = useParkingSectors();

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.filter({ status: 'active' }, '-start_at', 100);
        setEvents(data);
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
  };

  const backToSelect = () => {
    setPhase('select');
    setSelectedEvent(null);
    setSelectedEventId('');
    setSelectedZones(['general']);
    setSelectedSectors([]);
    setResult(null);
    setVerifying(false);
  };

  const backToMode = () => {
    setPhase('select');
  };

  const speak = useCallback((text) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-AR';
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  const handleQrDetected = async (code) => {
    if (qrCooldown.current || verifying || result) return;
    qrCooldown.current = true;
    setVerifying(true);
    setResult(null);
    try {
      const me = await base44.auth.me();
      const verifier = me?.full_name || me?.email || 'Sistema';
      const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');

      if (mode === 'person') {
        // --- Person validation ---
        const accreditations = await base44.entities.Accreditation.filter(
          { status: 'active', event_id: selectedEvent.id },
          '-created_date',
          500
        );
        const accred = accreditations.find((a) => a.id === code);

        if (!accred) {
          await base44.entities.AccessLog.create({
            accreditation_id: 'unknown',
            person_name: 'Desconocido',
            badge_code: code,
            event_name: selectedEvent.name,
            event_id: selectedEvent.id,
            verified_by: verifier,
            method: 'manual',
            zone: selectedZones.join(', '),
            result: 'denied',
            access_level: '',
          });
          setResult({ ok: false, type: 'person', message: 'Credencial no válida para este evento.' });
          return;
        }

        if (!canAccessAnyZone(accred.access_level, selectedZones)) {
          await base44.entities.AccessLog.create({
            accreditation_id: accred.id,
            person_name: accred.person_name,
            badge_code: accred.badge_code,
            event_name: accred.event_name,
            event_id: accred.event_id,
            verified_by: verifier,
            method: 'manual',
            zone: selectedZones.join(', '),
            result: 'denied',
            access_level: accred.access_level,
          });
          setResult({
            ok: false,
            person_name: accred.person_name,
            type: 'person',
            message: `Acceso restringido para la zona: ${zoneLabel}.`,
          });
          return;
        }

        await base44.entities.AccessLog.create({
          accreditation_id: accred.id,
          person_name: accred.person_name,
          badge_code: accred.badge_code,
          event_name: accred.event_name,
          event_id: accred.event_id,
          verified_by: verifier,
          method: 'manual',
          zone: selectedZones.join(', '),
          result: 'granted',
          access_level: accred.access_level,
        });

        setResult({ ok: true, person_name: accred.person_name, type: 'person', accred });
        return;
      }

      // --- Vehicle validation ---
      let vehicle = null;
      try {
        vehicle = await base44.entities.Vehicle.get(code);
      } catch {}

      if (!vehicle) {
        await base44.entities.AccessLog.create({
          accreditation_id: 'unknown',
          person_name: 'Desconocido',
          badge_code: code,
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          verified_by: verifier,
          method: 'manual',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: '',
        });
        setResult({ ok: false, type: 'vehicle', message: 'Vehículo no registrado.' });
        return;
      }

      const isAssigned = vehicle.event_ids?.includes(selectedEvent.id);

      if (!isAssigned) {
        await base44.entities.AccessLog.create({
          accreditation_id: vehicle.id,
          person_name: vehicle.person_name || '—',
          badge_code: vehicle.plate || code,
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          verified_by: verifier,
          method: 'manual',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: '',
        });
        setResult({
          ok: false,
          person_name: vehicle.person_name,
          type: 'vehicle',
          vehicle,
          message: 'Vehículo no asignado a este evento.',
        });
        return;
      }

      const sectorLabel = parkingSectors.find((s) => s.value === vehicle.parking_sector)?.label || vehicle.parking_sector || 'Sin sector';

      if (selectedSectors.length > 0 && vehicle.parking_sector && !selectedSectors.includes(vehicle.parking_sector)) {
        await base44.entities.AccessLog.create({
          accreditation_id: vehicle.id,
          person_name: vehicle.person_name || '—',
          badge_code: vehicle.plate || code,
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          verified_by: verifier,
          method: 'manual',
          zone: selectedSectors.join(', '),
          result: 'denied',
          access_level: vehicle.parking_sector,
        });
        setResult({
          ok: false,
          person_name: vehicle.person_name,
          type: 'vehicle',
          vehicle,
          message: `Sector de estacionamiento no permitido: ${sectorLabel}.`,
        });
        return;
      }

      await base44.entities.AccessLog.create({
        accreditation_id: vehicle.id,
        person_name: vehicle.person_name || '—',
        badge_code: vehicle.plate || code,
        event_name: selectedEvent.name,
        event_id: selectedEvent.id,
        verified_by: verifier,
        method: 'manual',
        zone: selectedSectors.join(', '),
        result: 'granted',
        access_level: vehicle.parking_sector || '',
      });

      setResult({ ok: true, person_name: vehicle.person_name, type: 'vehicle', vehicle });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
      setTimeout(() => { qrCooldown.current = false; }, 3000);
    }
  };

  useEffect(() => {
    if (!result) return;
    speak(result.ok ? 'Aceptado' : 'Denegado');
    const timer = setTimeout(() => {
      setResult(null);
      setCycle((c) => c + 1);
    }, 2500);
    return () => clearTimeout(timer);
  }, [result, speak]);

  const eventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              {mode === 'person' ? 'Control de Personas QR' : 'Control Vehicular QR'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {phase === 'active' && (
              <button onClick={backToSelect} className="text-sm font-medium text-slate-500 hover:text-slate-900">
                ← Cambiar evento
              </button>
            )}
            <Link to="/access-control" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Control de acceso
            </Link>
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              Panel
            </Link>
          </div>
        </div>
      </div>

      {/* Event selection phase */}
      {phase === 'select' && (
        <div className="mx-auto max-w-2xl px-5 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Control de acceso por QR</h2>
                <p className="text-sm text-slate-500">Elegí el tipo de acceso y el evento para iniciar.</p>
              </div>
            </div>

            {loadingEvents ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm text-slate-400">No hay eventos activos.</p>
                <p className="mt-1 text-xs text-slate-400">Activá un evento desde la página de Eventos para continuar.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {events.map((evt) => {
                    const st = getEventStatus(evt);
                    const info = STATUS_INFO[st];
                    const isSelected = selectedEventId === evt.id;
                    return (
                      <button
                        key={evt.id}
                        onClick={() => setSelectedEventId(evt.id)}
                        className={`w-full rounded-xl border p-4 text-left transition ${isSelected ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-slate-900">{evt.name}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{evt.venue || 'Sin sede'}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {evt.start_at ? new Date(evt.start_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}
                              {evt.end_at ? ` — ${new Date(evt.end_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${info.cls}`}>
                            {info.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {mode === 'person' && (
                  <div className="mt-5">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Zona(s) de control</label>
                    <p className="mb-2 text-xs text-slate-400">Seleccioná una o varias. Se permite el ingreso si la persona tiene acceso a alguna de las seleccionadas.</p>
                    <div className="flex flex-wrap gap-2">
                      {zones.map((z) => {
                        const active = selectedZones.includes(z.value);
                        return (
                          <button
                            key={z.value}
                            onClick={() => setSelectedZones((prev) => active ? prev.filter((v) => v !== z.value) : [...prev, z.value])}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                          >
                            {z.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {mode === 'vehicle' && (
                  <div className="mt-5">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Sector(es) de estacionamiento</label>
                    <p className="mb-2 text-xs text-slate-400">Seleccioná uno o varios. Se permite el ingreso si el vehículo tiene asignado alguno de los sectores seleccionados.</p>
                    {parkingSectors.length === 0 ? (
                      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        No hay sectores configurados. Se validará solo la asignación al evento.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {parkingSectors.map((s) => {
                          const active = selectedSectors.includes(s.value);
                          return (
                            <button
                              key={s.value}
                              onClick={() => setSelectedSectors((prev) => active ? prev.filter((v) => v !== s.value) : [...prev, s.value])}
                              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={startStation}
                  disabled={!selectedEventId || (mode === 'person' && selectedZones.length === 0)}
                  className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  Iniciar control de {mode === 'person' ? 'personas' : 'vehículos'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active station phase */}
      {phase === 'active' && selectedEvent && (
        <>
          {/* Event status banner */}
          <div className="border-b border-slate-200 bg-white px-5 py-3">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedEvent.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedEvent.venue || 'Sin sede'} ·{' '}
                  {mode === 'person'
                    ? `Zonas: ${selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ')}`
                    : `Sectores: ${selectedSectors.length > 0 ? selectedSectors.map((s) => parkingSectors.find((ps) => ps.value === s)?.label || s).join(', ') : 'Todos'}`}
                </p>
              </div>
              {eventStatus === 'ended' ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-4 w-4" /> Evento finalizado
                </div>
              ) : eventStatus === 'grace' ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                  <Clock className="h-4 w-4" /> Período de gracia ({selectedEvent.grace_hours ?? 4}h)
                </div>
              ) : eventStatus === 'upcoming' ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                  <Clock className="h-4 w-4" /> El evento aún no inició
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> En curso
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto max-w-2xl px-5 py-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className={`grid h-10 w-10 place-items-center rounded-lg ${mode === 'person' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {mode === 'person' ? <User className="h-5 w-5" /> : <Car className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {mode === 'person' ? 'Acceso de personas' : 'Acceso vehicular'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {mode === 'person'
                      ? 'Enfocá el QR de la credencial para validar el ingreso.'
                      : 'Enfocá el QR de la credencial vehicular para validar el ingreso.'}
                  </p>
                </div>
              </div>

              {(eventStatus === 'upcoming' || eventStatus === 'ended') ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <p className="mt-4 text-lg font-bold text-slate-900">
                    {eventStatus === 'upcoming' ? 'El evento aún no ha comenzado' : 'El evento ha finalizado'}
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    {eventStatus === 'upcoming'
                      ? `Inicia el ${selectedEvent.start_at ? new Date(selectedEvent.start_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) : 'fecha no definida'}`
                      : `Finalizó el ${selectedEvent.end_at ? new Date(selectedEvent.end_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' }) : 'fecha no definida'}`}
                  </p>
                  <button onClick={backToSelect} className="mt-6 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                    ← Volver a selección de evento
                  </button>
                </div>
              ) : verifying ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                  <span className="mt-3 text-sm text-slate-500">Verificando…</span>
                </div>
              ) : !result ? (
                <QrScanner key={cycle} onDetected={handleQrDetected} paused={!!result || verifying} />
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Full-screen result overlay */}
      {result && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600' : 'bg-red-600'}`}
          onClick={() => { setResult(null); setCycle((c) => c + 1); }}
        >
          {result.ok ? (
            <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-32 w-32 text-white" strokeWidth={1.5} />
          )}
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            {result.ok ? 'ACEPTADO' : 'DENEGADO'}
          </p>
          {result.type && (
            <div className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
              {result.type === 'vehicle' ? <Car className="h-4 w-4" /> : <User className="h-4 w-4" />}
              {result.type === 'vehicle' ? 'Vehículo' : 'Persona'}
            </div>
          )}
          {result.vehicle && (
            <p className="mt-2 text-xl font-bold text-white">
              {result.vehicle.plate} · {result.vehicle.brand} {result.vehicle.model}
            </p>
          )}
          {result.person_name && (
            <p className="mt-2 text-lg text-white/80">{result.person_name}</p>
          )}
          {!result.ok && result.message && (
            <p className="mt-1 max-w-md px-6 text-center text-sm text-white/70">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}