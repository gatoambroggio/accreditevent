import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Calendar, Clock, AlertTriangle, Car, User, WifiOff, RefreshCw, CloudUpload, Lock } from 'lucide-react';
import QrScanner from '@/components/QrScanner';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { getEventStatus, EVENT_STATUS_INFO, speakResult } from '@/lib/accessUtils';
import ScanModeToggle from '@/components/scan/ScanModeToggle';
import HardwareScannerInput from '@/components/scan/HardwareScannerInput';
import { useScanMode } from '@/components/scan/useScanMode';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePdaHeartbeat } from '@/hooks/usePdaRegistration';
import { saveEventData, getEventData, getCacheAgeMs, queueAccessLog, setCachedVerifier, getCachedVerifier } from '@/lib/offlineAccess';
import { validatePersonAccred, validateVehicleObj } from '@/lib/offlineValidation';
import PdaPinPrompt from '@/components/PdaPinPrompt';

const ASSIGNED_SYNC_MS = 15 * 1000;

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
  const [scanMode, setScanMode] = useScanMode();
  const [downloading, setDownloading] = useState(false);
  const [cacheAge, setCacheAge] = useState(null);
  const [accreditations, setAccreditations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const qrCooldown = useRef(false);
  const { zones } = useZones();
  const { sectors: parkingSectors } = useParkingSectors();
  const online = useOnlineStatus();
  const { pendingCount, syncing, refresh: refreshPending } = useOfflineSync(online);
  // Detección real de conexión: navigator.onLine puede ser true aun sin
  // internet (wifi sin salida). realOnline se ajusta según el resultado del
  // último fetch: si la API responde hay red; si falla, pasamos a modo offline
  // y usamos el caché. Así el modo offline funciona aunque el browser "crea"
  // que está online.
  const [realOnline, setRealOnline] = useState(online);
  const effectiveOffline = !realOnline;
  // Registro y heartbeat de la PDA (número seteado una sola vez en el módulo PDA ID).
  const { pdaNumber } = usePdaHeartbeat({
    enabled: phase === 'active',
    event: selectedEvent,
    mode,
    zones: selectedZones,
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

  // Sincronización automática: cada 15 segundos descarga las credenciales y
  // vehículos del evento ASIGNADO a esta PDA (panel Estaciones PDA) y, si el
  // operador eligió otro, también del seleccionado. Así el caché siempre está
  // fresco y el modo offline funciona. Corre desde que se conoce el número de
  // PDA (no requiere iniciar la estación) y sólo sincroniza el/los evento(s)
  // de esta PDA, no todos.
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

  // Pre-selección automática de evento y zona desde la asignación remota del
  // administrador (panel Estaciones PDA). Sólo pre-carga si el operador aún no
  // eligió manualmente.
  useEffect(() => {
    if (!pdaNumber || events.length === 0) return;
    (async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const withEvent = mine.find((s) => s.assigned_event_id && events.some((e) => e.id === s.assigned_event_id));
        if (withEvent) {
          if (!selectedEventId) setSelectedEventId(withEvent.assigned_event_id);
          if (withEvent.assigned_zone) {
            const zs = withEvent.assigned_zone.split(',').map((z) => z.trim()).filter(Boolean);
            if (zs.length > 0) setSelectedZones(zs);
          }
          if (Array.isArray(withEvent.assigned_sectors)) setSelectedSectors(withEvent.assigned_sectors);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdaNumber, events]);

  // Sincronización en vivo de la configuración remota (panel Estaciones PDA):
  // cada 10 segundos actualiza zonas, sectores y evento desde el backend, así
  // los cambios del administrador aplican de inmediato en la PDA activa.
  useEffect(() => {
    if (!online || phase !== 'active' || !pdaNumber) return;
    const sync = async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const st = mine.find((s) => s.assigned_event_id) || mine[0];
        if (!st) return;
        if (!unlocked && st.assigned_zone) {
          const zs = st.assigned_zone.split(',').map((z) => z.trim()).filter(Boolean);
          if (zs.length > 0) setSelectedZones(zs);
        }
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

  const [downloadError, setDownloadError] = useState('');

  const downloadEventData = async (evt, silent = false) => {
    if (!silent) setDownloading(true);
    setDownloadError('');
    // Descarga vía función backend (asServiceRole): NO depende del RLS del
    // operador (problema de casing User.company/Company.name que dejaba la
    // caché vacía). Devuelve sólo las acreditaciones activas y vehículos del
    // evento indicado.
    let res = null;
    let failed = false;
    try {
      res = await base44.functions.invoke('getEventAccessData', { event_id: evt.id });
    } catch {
      failed = true;
    }
    const data = !failed && res?.data && !res.data.error ? res.data : null;
    const ok = !!data && Array.isArray(data.accreditations);
    // Detección real de conexión: si la función respondió hay red; si falló
    // (wifi sin internet), pasamos a modo offline y usamos caché.
    setRealOnline(ok);
    const accs = ok ? data.accreditations : [];
    const vehs = ok ? data.vehicles : [];
    const prev = getEventData(evt.id);
    const prevAccs = prev?.accreditations || [];
    const prevVehs = prev?.vehicles || [];

    // Si la descarga trajo personas, actualizamos; si falló pero hay caché
    // válido, NO pisamos el caché con listas vacías: conservamos el anterior.
    const accreditationsOk = ok && accs.length > 0;
    const finalAccs = accreditationsOk ? accs : prevAccs;
    const finalVehs = ok ? vehs : prevVehs;

    setAccreditations(finalAccs);
    setVehicles(finalVehs);

    // Solo persistimos en caché si tenemos personas reales (no vacías), para no
    // destruir un caché válido con datos vacíos por una caída de red.
    if (accreditationsOk) {
      saveEventData(evt.id, { accreditations: finalAccs, vehicles: finalVehs });
      setCacheAge(0);
    } else if (prevAccs.length > 0) {
      // Descarga falló pero hay caché previo: lo conservamos y avisamos.
      const age = getCacheAgeMs(evt.id);
      setCacheAge(age);
      setDownloadError(`No se pudo actualizar (sin conexión). Usando caché previo de hace ${Math.max(1, Math.round(age / 60000))} min.`);
    } else {
      // Sin caché previo y sin datos nuevos: error crítico.
      setDownloadError('No se pudieron descargar los datos del evento. Revisá la conexión y volvé a intentar.');
    }
    if (!silent) setDownloading(false);
  };

  const startStation = () => {
    const evt = events.find((e) => e.id === selectedEventId);
    if (!evt) return;
    setSelectedEvent(evt);
    setPhase('active');
    setCycle((c) => c + 1);
    setResult(null);
    // Cargar siempre el caché en memoria de inmediato (sincrónico) para que el
    // escaneo funcione aunque la descarga en segundo plano falle (wifi sin internet).
    const cache = getEventData(evt.id);
    setAccreditations(cache?.accreditations || []);
    setVehicles(cache?.vehicles || []);
    setCacheAge(getCacheAgeMs(evt.id));
    // El registro y heartbeat de la PDA los maneja usePdaHeartbeat.
    // La descarga inicial la dispara el useEffect al setear selectedEvent.
  };

  const resetFlow = () => {
    setResult(null);
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
    setAccreditations([]);
    setVehicles([]);
  };

  // Resuelve la lista de acreditaciones: usa el estado en memoria si tiene datos;
  // si está vacío (descarga falló o "fake online" sin internet real), cae al caché.
  const resolveAccreditations = () => {
    if (accreditations.length > 0) return accreditations;
    const cache = getEventData(selectedEvent.id);
    return cache?.accreditations || [];
  };

  const resolveVehicles = () => {
    if (vehicles.length > 0) return vehicles;
    const cache = getEventData(selectedEvent.id);
    return cache?.vehicles || [];
  };

  // Fallback online: obtener acreditación por id directo (por si excede el límite o RLS por evento).
  const fallbackGetAccred = async (code) => {
    if (effectiveOffline) return null;
    try { return await base44.entities.Accreditation.get(code); } catch { return null; }
  };

  // Persiste un cambio de zonas/sectores hecho desde la PDA (con clave) en la
  // estación del backend, así queda registrado y se sincroniza con el panel.
  const persistPdaConfig = async (patch) => {
    if (!pdaNumber) return;
    try {
      const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 5);
      if (mine?.[0]?.id) await base44.entities.PdaStation.update(mine[0].id, patch);
    } catch {}
  };

  const handleQrDetected = async (code) => {
    if (qrCooldown.current || verifying || result) return;
    qrCooldown.current = true;
    setVerifying(true);
    const verifier = getCachedVerifier();
    try {
      const logAccess = async (res, opts = {}) => {
        const entry = {
          accreditation_id: opts.id || 'unknown',
          person_name: opts.person_name || 'Desconocido',
          badge_code: opts.badge_code || code,
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          company: opts.company || selectedEvent.company,
          verified_by: verifier,
          method: 'manual',
          resource_type: opts.resource_type || 'person',
          zone: opts.zone || (opts.resource_type === 'vehicle' ? selectedSectors.join(', ') : selectedZones.join(', ')),
          result: res,
          access_level: opts.access_level || '',
        };
        if (effectiveOffline) {
          queueAccessLog(entry);
          refreshPending();
        } else {
          try { await base44.entities.AccessLog.create(entry); } catch {}
        }
      };

      // --- Modo vehicular puro (ruta /control-vehicular) ---
      if (mode === 'vehicle') {
        const vehs = resolveVehicles();
        let vehicle = vehs.find((v) => v.id === code || (v.plate && v.plate.toUpperCase() === String(code).toUpperCase()));
        if (!vehicle && !effectiveOffline) {
          // fallback online directo por id
          try { const dv = await base44.entities.Vehicle.get(code); if (dv && (dv.event_ids || []).includes(selectedEvent.id)) vehicle = dv; } catch {}
        }
        const vr = validateVehicleObj(vehicle, selectedEvent, selectedSectors, parkingSectors);
        await logAccess(vr.ok ? 'granted' : 'denied', vehicle ? { id: vehicle.id, person_name: vehicle.person_name, badge_code: vehicle.plate, access_level: vehicle.parking_sector, resource_type: 'vehicle' } : { resource_type: 'vehicle' });
        if (vr.ok) {
          setResult({ ok: true, type: 'vehicle', person_name: vehicle.person_name, vehicle });
        } else {
          setResult({ ok: false, type: 'vehicle', person_name: vehicle?.person_name, vehicle, message: vr.message });
        }
        return;
      }

      // --- Modo persona: detección automática persona vs vehículo ---
      const accs = resolveAccreditations();
      const vehs = resolveVehicles();

      // 1) ¿Es una acreditación de persona? (por id o badge_code)
      let accred = accs.find((a) => a.id === code || (a.badge_code && a.badge_code === code));
      // 2) ¿Es un vehículo? (por id o patente)
      let vehicle = vehs.find((v) => v.id === code || (v.plate && v.plate.toUpperCase() === String(code).toUpperCase()));

      // Fallback online directo si no se encontró en listado (superaba límite o RLS por evento asignado)
      if (!accred && !vehicle && !effectiveOffline) {
        accred = await fallbackGetAccred(code);
        if (accred && accred.event_id !== selectedEvent.id) accred = null;
        if (accred) {
          // Cachear para futuras validaciones offline
          setAccreditations((prev) => prev.some((a) => a.id === accred.id) ? prev : [...prev, accred]);
          const cache = getEventData(selectedEvent.id);
          if (cache) saveEventData(selectedEvent.id, { ...cache, accreditations: [...(cache.accreditations || []), accred] });
        }
        if (!accred) {
          try {
            const dv = await base44.entities.Vehicle.get(code);
            if (dv && (dv.event_ids || []).includes(selectedEvent.id)) {
              vehicle = dv;
              setVehicles((prev) => prev.some((v) => v.id === dv.id) ? prev : [...prev, dv]);
              const c2 = getEventData(selectedEvent.id);
              if (c2) saveEventData(selectedEvent.id, { ...c2, vehicles: [...(c2.vehicles || []), dv] });
            }
          } catch {}
        }
      }

      if (accred) {
        const pv = validatePersonAccred(accred, selectedEvent, selectedZones, zones);
        await logAccess(pv.ok ? 'granted' : 'denied', { id: accred.id, person_name: accred.person_name, badge_code: accred.badge_code, company: accred.company, access_level: accred.access_level });
        setResult(pv.ok
          ? { ok: true, type: 'person', person_name: accred.person_name, accred }
          : { ok: false, type: 'person', person_name: accred.person_name || '', accred, message: pv.message });
        return;
      }

      if (vehicle) {
        const vr = validateVehicleObj(vehicle, selectedEvent, selectedSectors, parkingSectors);
        await logAccess(vr.ok ? 'granted' : 'denied', { id: vehicle.id, person_name: vehicle.person_name, badge_code: vehicle.plate, access_level: vehicle.parking_sector, resource_type: 'vehicle' });
        setResult(vr.ok
          ? { ok: true, type: 'vehicle', person_name: vehicle.person_name, vehicle }
          : { ok: false, type: 'vehicle', person_name: vehicle?.person_name, vehicle, message: vr.message });
        return;
      }

      // No encontrado en ningún listado
      await logAccess('denied', {});
      const hasCache = resolveAccreditations().length > 0 || resolveVehicles().length > 0;
      setResult({
        ok: false,
        type: 'unknown',
        message: effectiveOffline && !hasCache
          ? 'Sin datos offline para este evento. Conectá la PDA a internet y abrí el control al menos una vez para descargar las credenciales.'
          : 'Credencial no encontrada para este evento.',
      });
    } catch (err) {
      setResult({ ok: false, type: 'unknown', message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
      setTimeout(() => { qrCooldown.current = false; }, 1200);
    }
  };

  // Auto-clear del resultado para continuar escaneando
  useEffect(() => {
    if (result) {
      speakResult(result.ok);
      const timer = setTimeout(() => {
        setResult(null);
        setCycle((c) => c + 1);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const eventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;
  const isPaused = verifying || !!result;
  const hwDisabled = verifying || !!result;

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              {mode === 'person' ? 'Control de Acceso QR' : 'Control Vehicular QR'}
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
                <p className="text-sm text-slate-500">
                  {mode === 'person'
                    ? 'Elegí el evento. Se detecta automáticamente si el QR es de persona o vehículo.'
                    : 'Elegí el evento y el sector para iniciar.'}
                </p>
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
                    const info = EVENT_STATUS_INFO[st];
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
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">Zona(s) de control (personas)</label>
                      <button type="button" onClick={() => setPinOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                        <Lock className="h-3.5 w-3.5" /> Modificar con clave
                      </button>
                    </div>
                    <p className="mb-2 text-xs text-slate-400">Asignadas desde el panel Estaciones PDA. Para cambiarlas desde la PDA necesitás la clave de administrador.</p>
                    {unlocked ? (
                      <div className="flex flex-wrap gap-2">
                        {zones.map((z) => {
                          const active = selectedZones.includes(z.value);
                          return (
                            <button key={z.value} onClick={() => setSelectedZones((prev) => { const next = active ? prev.filter((v) => v !== z.value) : [...prev, z.value]; persistPdaConfig({ assigned_zone: next.join(', ') }); return next; })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{z.label}</button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedZones.length === 0 ? <span className="text-xs text-slate-400">Sin zonas asignadas.</span> : selectedZones.map((zv) => (
                          <span key={zv} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{zones.find((z) => z.value === zv)?.label || zv}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">Sector(es) de estacionamiento (vehículos)</label>
                    <button type="button" onClick={() => setPinOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                      <Lock className="h-3.5 w-3.5" /> Modificar con clave
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-slate-400">Asignados desde el panel Estaciones PDA. Para cambiarlos desde la PDA necesitás la clave de administrador.</p>
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
                    <Link to="/pda-id" className="text-xs font-bold text-emerald-700 hover:underline">Cambiar</Link>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-amber-700">Configurá el número de esta PDA antes de iniciar.</p>
                    <Link to="/pda-id" className="text-xs font-bold text-amber-800 hover:underline">Ir a PDA ID</Link>
                  </div>
                )}

                <button
                  onClick={startStation}
                  disabled={!selectedEventId || !pdaNumber || (mode === 'person' && selectedZones.length === 0)}
                  className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  Iniciar control de acceso
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
                    ? `Zonas: ${selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ')} · Sectores: ${selectedSectors.length > 0 ? selectedSectors.map((s) => parkingSectors.find((ps) => ps.value === s)?.label || s).join(', ') : 'Todos'}`
                    : `Sectores: ${selectedSectors.length > 0 ? selectedSectors.map((s) => parkingSectors.find((ps) => ps.value === s)?.label || s).join(', ') : 'Todos'}`}
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
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Acceso por QR</h2>
                    <p className="text-sm text-slate-500">
                      {scanMode === 'scanner'
                        ? 'Apretá el gatillo y leé el QR de persona o vehículo: la app detecta el tipo automáticamente.'
                        : 'Enfocá el QR de persona o vehículo: la app detecta el tipo automáticamente.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <ScanModeToggle mode={scanMode} onChange={setScanMode} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {effectiveOffline ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                      <WifiOff className="h-3.5 w-3.5" /> Modo offline (sin conexión) · usando caché
                    </span>
                  ) : downloading ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Descargando datos del evento…</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {accreditations.length} personas / {vehicles.length} vehículos en memoria</span>
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
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {downloadError}
                  </div>
                )}
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
              ) : (resolveAccreditations().length === 0 && resolveVehicles().length === 0) && !downloading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <p className="mt-4 text-lg font-bold text-slate-900">Sin datos cargados para este evento</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    {effectiveOffline
                      ? 'No hay datos en caché. Conectate a internet y abrí el control al menos una vez para descargarlos.'
                      : 'No se pudieron descargar los datos. Verificá la conexión y volvé a intentarlo.'}
                  </p>
                  <button onClick={backToSelect} className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                    ← Volver
                  </button>
                </div>
              ) : verifying ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                  <span className="mt-3 text-sm text-slate-500">Verificando…</span>
                </div>
              ) : (
                <>
                  {scanMode === 'scanner' ? (
                    <HardwareScannerInput onScan={handleQrDetected} disabled={hwDisabled} />
                  ) : (
                    <QrScanner key={cycle} onDetected={handleQrDetected} paused={isPaused} />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Full-screen result overlay */}
      {result && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600' : 'bg-red-600'}`}
          onClick={resetFlow}
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
            {result.type === 'vehicle' ? <Car className="h-4 w-4" /> : <User className="h-4 w-4" />}
            {result.type === 'vehicle' ? 'Vehículo' : result.type === 'person' ? 'Persona' : 'Credencial'}
          </div>
          {result.type === 'vehicle' && result.vehicle && (
            <p className="mt-2 text-xl font-bold text-white">
              {result.vehicle.plate} · {result.vehicle.brand} {result.vehicle.model}
            </p>
          )}
          {result.person_name && (
            <p className="mt-2 text-lg text-white/90">{result.person_name}</p>
          )}
          {result.type === 'person' && result.accred?.access_level && (
            <p className="mt-1 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
              Acceso: {result.accred.access_level}
            </p>
          )}
          {result.type === 'vehicle' && result.ok && result.vehicle?.parking_sector && (
            <p className="mt-1 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white">
              Estacionamiento: {parkingSectors.find((s) => s.value === result.vehicle.parking_sector)?.label || result.vehicle.parking_sector}
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