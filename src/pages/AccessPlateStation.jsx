import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Calendar, Clock, AlertTriangle, Car, WifiOff, RefreshCw, CloudUpload, Lock, MapPin } from 'lucide-react';
import PatenteScanner from '@/components/PatenteScanner';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { getEventStatus, EVENT_STATUS_INFO, speakResult } from '@/lib/accessUtils';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePdaHeartbeat } from '@/hooks/usePdaRegistration';
import { saveEventData, getEventData, getCacheAgeMs, queueAccessLog, setCachedVerifier, getCachedVerifier } from '@/lib/offlineAccess';
import { validateVehicleObj } from '@/lib/offlineValidation';
import PdaPinPrompt from '@/components/PdaPinPrompt';

const ASSIGNED_SYNC_MS = 15 * 1000;
const normalizeKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Estación de control vehicular por lectura automática de patentes.
// Reusa el caché offline del evento (getEventAccessData) para que la búsqueda
// del vehículo sea instantánea al leer la patente, valida el sector de
// estacionamiento y muestra el overlay verde/rojo igual que el control de QR.
export default function AccessPlateStation() {
  const [phase, setPhase] = useState('select');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [cacheAge, setCacheAge] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const plateCooldown = useRef(false);
  const { sectors: parkingSectors } = useParkingSectors();
  const online = useOnlineStatus();
  const { pendingCount, syncing, refresh: refreshPending } = useOfflineSync(online);
  const [realOnline, setRealOnline] = useState(online);
  const effectiveOffline = !realOnline;
  const { pdaNumber } = usePdaHeartbeat({
    enabled: phase === 'active',
    event: selectedEvent,
    mode: 'vehicle',
    zones: [],
    sectors: selectedSectors,
    pendingCount,
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.filter({ status: 'active' }, '-start_at', 100);
        setEvents(data);
      } catch {}
      setLoadingEvents(false);
      try {
        const me = await base44.auth.me();
        if (me?.full_name || me?.email) setCachedVerifier(me.full_name || me.email);
      } catch {}
    })();
  }, []);

  // Sincronización automática del evento asignado a esta PDA + el seleccionado.
  useEffect(() => {
    if (!online || !pdaNumber) return;
    const sync = async () => {
      const toSync = new Set();
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 5);
        const st = mine?.[0];
        if (st?.assigned_event_id) toSync.add(st.assigned_event_id);
      } catch {}
      if (selectedEventId) toSync.add(selectedEventId);
      for (const eid of toSync) {
        const evt = events.find((e) => e.id === eid);
        if (evt) downloadEventData(evt, true);
      }
    };
    sync();
    const id = setInterval(sync, ASSIGNED_SYNC_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pdaNumber, events, selectedEventId]);

  // Pre-selección desde la asignación remota (Estaciones PDA).
  useEffect(() => {
    if (!pdaNumber || events.length === 0) return;
    (async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const withEvent = mine.find((s) => s.assigned_event_id && events.some((e) => e.id === s.assigned_event_id));
        if (withEvent) {
          if (!selectedEventId) setSelectedEventId(withEvent.assigned_event_id);
          if (Array.isArray(withEvent.assigned_sectors)) setSelectedSectors(withEvent.assigned_sectors);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdaNumber, events]);

  // Sincronización en vivo de la configuración remota mientras la estación está activa.
  useEffect(() => {
    if (!online || phase !== 'active' || !pdaNumber) return;
    const sync = async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const st = mine.find((s) => s.assigned_event_id) || mine[0];
        if (!st) return;
        if (!unlocked && Array.isArray(st.assigned_sectors)) setSelectedSectors(st.assigned_sectors);
        if (st.assigned_event_id && st.assigned_event_id !== selectedEventId) {
          const evt = events.find((e) => e.id === st.assigned_event_id);
          if (evt) { setSelectedEvent(evt); setSelectedEventId(evt.id); }
        }
      } catch {}
    };
    sync();
    const id = setInterval(sync, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, phase, pdaNumber, selectedEventId, events, unlocked]);

  const downloadEventData = async (evt, silent = false) => {
    if (!silent) setDownloading(true);
    setDownloadError('');
    let res = null;
    let failed = false;
    try {
      res = await base44.functions.invoke('getEventAccessData', { event_id: evt.id });
    } catch { failed = true; }
    const data = !failed && res?.data && !res.data.error ? res.data : null;
    const ok = !!data && Array.isArray(data.accreditations);
    setRealOnline(ok);
    const vehs = ok ? data.vehicles : [];
    const prev = getEventData(evt.id);
    const prevVehs = prev?.vehicles || [];
    const finalVehs = ok ? vehs : prevVehs;
    setVehicles(finalVehs);
    if (ok) {
      saveEventData(evt.id, { accreditations: data.accreditations, vehicles: finalVehs });
      setCacheAge(0);
    } else if (prevVehs.length > 0) {
      const age = getCacheAgeMs(evt.id);
      setCacheAge(age);
      setDownloadError(`Sin conexión. Usando caché previo de hace ${Math.max(1, Math.round(age / 60000))} min.`);
    } else {
      setDownloadError('No se pudieron descargar los datos del evento.');
    }
    if (!silent) setDownloading(false);
  };

  const startStation = () => {
    const evt = events.find((e) => e.id === selectedEventId);
    if (!evt) return;
    setSelectedEvent(evt);
    setPhase('active');
    setResult(null);
    const cache = getEventData(evt.id);
    setVehicles(cache?.vehicles || []);
    setCacheAge(getCacheAgeMs(evt.id));
  };

  const backToSelect = () => {
    setPhase('select');
    setSelectedEvent(null);
    setSelectedEventId('');
    setSelectedSectors([]);
    setResult(null);
    setVerifying(false);
    setVehicles([]);
  };

  const resolveVehicles = () => {
    if (vehicles.length > 0) return vehicles;
    const cache = getEventData(selectedEvent.id);
    return cache?.vehicles || [];
  };

  const persistPdaConfig = async (patch) => {
    if (!pdaNumber) return;
    try {
      const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 5);
      if (mine?.[0]?.id) await base44.entities.PdaStation.update(mine[0].id, patch);
    } catch {}
  };

  const handlePlate = async (plate) => {
    if (plateCooldown.current || verifying || result) return;
    plateCooldown.current = true;
    setVerifying(true);
    const p = normalizeKey(plate);
    const verifier = getCachedVerifier();
    try {
      const logAccess = async (res, opts = {}) => {
        const entry = {
          accreditation_id: opts.id || 'unknown',
          person_name: opts.person_name || 'Desconocido',
          badge_code: opts.badge_code || plate,
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          company: opts.company || selectedEvent.company,
          verified_by: verifier,
          pda_number: pdaNumber || '',
          method: 'manual',
          resource_type: 'vehicle',
          zone: selectedSectors.join(', '),
          result: res,
          denied_reason: res === 'denied' ? (opts.denied_reason || '') : '',
          access_level: opts.access_level || '',
        };
        if (effectiveOffline) { queueAccessLog(entry); refreshPending(); }
        else { try { await base44.entities.AccessLog.create(entry); } catch {} }
      };

      // 1) Búsqueda instantánea en caché (offline-capable)
      let vehicle = resolveVehicles().find((v) => normalizeKey(v.plate) === p);
      // 2) Fallback online si no está en caché
      if (!vehicle && !effectiveOffline) {
        try {
          const res = await base44.entities.Vehicle.filter({ plate, status: { $in: ['approved', 'pending'] } });
          if (res && res.length > 0) {
            const dv = res.find((v) => (v.event_ids || []).includes(selectedEvent.id)) || res[0];
            if (dv && (dv.event_ids || []).includes(selectedEvent.id)) vehicle = dv;
          }
        } catch {}
      }

      const vr = validateVehicleObj(vehicle, selectedEvent, selectedSectors, parkingSectors);
      await logAccess(vr.ok ? 'granted' : 'denied', vehicle ? { id: vehicle.id, person_name: vehicle.person_name, badge_code: vehicle.plate, access_level: vehicle.parking_sector, denied_reason: vr.reason } : { denied_reason: vr.reason });
      if (vr.ok) {
        setResult({ ok: true, type: 'vehicle', person_name: vehicle.person_name, vehicle, sectorLabel: vr.sectorLabel });
      } else {
        setResult({ ok: false, type: 'vehicle', person_name: vehicle?.person_name, vehicle, message: vr.message, sectorLabel: vr.sectorLabel, reason: vr.reason });
      }
    } catch (err) {
      setResult({ ok: false, type: 'vehicle', message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
      setTimeout(() => { plateCooldown.current = false; }, 800);
    }
  };

  // Auto-clear del resultado para continuar escaneando
  useEffect(() => {
    if (result) {
      speakResult(result.ok);
      const timer = setTimeout(() => { setResult(null); }, 2000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const eventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-sm font-extrabold text-white">P</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Control Vehicular por Patentes</span>
          </div>
          <div className="flex items-center gap-4">
            {phase === 'active' && (
              <button onClick={backToSelect} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Cambiar evento</button>
            )}
            <Link to="/access-control" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Control de acceso</Link>
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">Panel</Link>
          </div>
        </div>
      </div>

      {/* Selección de evento */}
      {phase === 'select' && (
        <div className="mx-auto max-w-2xl px-5 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Control vehicular por patentes</h2>
                <p className="text-sm text-slate-500">Elegí el evento y el sector de estacionamiento para iniciar.</p>
              </div>
            </div>

            {loadingEvents ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
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
                    const info = EVENT_STATUS_INFO[st];
                    const isSelected = selectedEventId === evt.id;
                    return (
                      <button
                        key={evt.id}
                        onClick={() => setSelectedEventId(evt.id)}
                        className={`w-full rounded-xl border p-4 text-left transition ${isSelected ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
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
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${info.cls}`}>{info.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">Sector(es) de estacionamiento</label>
                    <button type="button" onClick={() => setPinOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline">
                      <Lock className="h-3.5 w-3.5" /> Modificar con clave
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-slate-400">Asignados desde el panel Estaciones PDA. Para cambiarlos necesitás la clave de administrador.</p>
                  {parkingSectors.length === 0 ? (
                    <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
                      No hay sectores configurados. Se validará solo la asignación al evento.
                    </div>
                  ) : unlocked ? (
                    <div className="flex flex-wrap gap-2">
                      {parkingSectors.map((s) => {
                        const active = selectedSectors.includes(s.value);
                        return (
                          <button key={s.value} onClick={() => setSelectedSectors((prev) => { const next = active ? prev.filter((v) => v !== s.value) : [...prev, s.value]; persistPdaConfig({ assigned_sectors: next }); return next; })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{s.label}</button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedSectors.length === 0 ? <span className="text-xs text-slate-400">Sin sectores asignados.</span> : selectedSectors.map((sv) => (
                        <span key={sv} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">{parkingSectors.find((s) => s.value === sv)?.label || sv}</span>
                      ))}
                    </div>
                  )}
                </div>

                {pdaNumber ? (
                  <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">PDA de este dispositivo</p>
                      <p className="text-sm font-bold text-slate-900">Estación #{pdaNumber}</p>
                    </div>
                    <Link to="/pda-id" className="text-xs font-bold text-amber-700 hover:underline">Cambiar</Link>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-amber-700">Configurá el número de esta PDA antes de iniciar.</p>
                    <Link to="/pda-id" className="text-xs font-bold text-amber-800 hover:underline">Ir a PDA ID</Link>
                  </div>
                )}

                <button
                  onClick={startStation}
                  disabled={!selectedEventId || !pdaNumber}
                  className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                >
                  Iniciar control de patentes
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Estación activa */}
      {phase === 'active' && selectedEvent && (
        <>
          <div className="border-b border-slate-200 bg-white px-5 py-3">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedEvent.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedEvent.venue || 'Sin sede'} · Sectores: {selectedSectors.length > 0 ? selectedSectors.map((s) => parkingSectors.find((ps) => ps.value === s)?.label || s).join(', ') : 'Todos'}
                </p>
              </div>
              {eventStatus === 'ended' ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-4 w-4" /> Evento finalizado
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
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-600">
                    <Car className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Acceso por patentes</h2>
                    <p className="text-sm text-slate-500">Enfocá la patente. La cámara la lee y valida automáticamente.</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {effectiveOffline ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                      <WifiOff className="h-3.5 w-3.5" /> Modo offline · usando caché
                    </span>
                  ) : downloading ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Descargando datos del evento…</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {vehicles.length} vehículos en memoria</span>
                  )}
                  {cacheAge != null && (
                    <span className="text-slate-500">Caché: {cacheAge === 0 ? 'actualizada' : `hace ${Math.max(1, Math.round(cacheAge / 60000))} min`}</span>
                  )}
                  {pendingCount > 0 && (
                    <span className={`inline-flex items-center gap-1 ${syncing ? 'text-emerald-600' : 'text-amber-600'}`}>
                      <CloudUpload className="h-3.5 w-3.5" /> {syncing ? 'Sincronizando…' : `${pendingCount} registro(s) pendientes`}
                    </span>
                  )}
                </div>
                {downloadError && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{downloadError}</div>
                )}
              </div>

              {(eventStatus === 'upcoming' || eventStatus === 'ended') ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <p className="mt-4 text-lg font-bold text-slate-900">{eventStatus === 'upcoming' ? 'El evento aún no ha comenzado' : 'El evento ha finalizado'}</p>
                  <button onClick={backToSelect} className="mt-6 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">← Volver</button>
                </div>
              ) : verifying ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                  <span className="mt-3 text-sm text-slate-500">Verificando…</span>
                </div>
              ) : (
                <PatenteScanner continuous onPatente={handlePlate} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Overlay verde/rojo */}
      {result && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600' : 'bg-red-600'}`}
          onClick={() => setResult(null)}
        >
          {result.ok ? (
            <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-32 w-32 text-white" strokeWidth={1.5} />
          )}
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            {result.ok ? 'ACEPTADO' : 'DENEGADO'}
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
            <Car className="h-4 w-4" /> Vehículo
          </div>
          {result.vehicle && (
            <p className="mt-2 text-xl font-bold text-white">
              {result.vehicle.plate} · {result.vehicle.brand} {result.vehicle.model}
            </p>
          )}
          {result.person_name && (
            <p className="mt-1 text-lg text-white/90">{result.person_name}</p>
          )}
          {result.ok && result.sectorLabel && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
              <MapPin className="h-4 w-4" /> Estacionamiento: {result.sectorLabel}
            </p>
          )}
          {!result.ok && result.reason === 'zone' && result.sectorLabel && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
              <MapPin className="h-4 w-4" /> Sector incorrecto: {result.sectorLabel}
            </p>
          )}
          {!result.ok && result.message && (
            <p className="mt-1 max-w-md px-6 text-center text-sm text-white/70">{result.message}</p>
          )}
        </div>
      )}

      <PdaPinPrompt open={pinOpen} onClose={() => setPinOpen(false)} pdaNumber={pdaNumber} onSuccess={() => { setUnlocked(true); setPinOpen(false); }} />
    </div>
  );
}