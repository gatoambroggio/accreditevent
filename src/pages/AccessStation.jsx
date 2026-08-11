import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle, Calendar, Clock, AlertTriangle } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import { findBestMatch } from '@/lib/faceRecognition';
import { canAccessAnyZone } from '@/lib/accessZones';
import { useZones } from '@/lib/useZones';
import { getEventStatus, EVENT_STATUS_INFO, speakResult, isWithinEventPhases } from '@/lib/accessUtils';
import { phaseLabel } from '@/lib/eventPhases';
import { usePdaHeartbeat } from '@/hooks/usePdaRegistration';

export default function AccessStation() {
  const [phase, setPhase] = useState('select');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedZones, setSelectedZones] = useState(['general']);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [cycle, setCycle] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const { zones } = useZones();
  const { pdaNumber } = usePdaHeartbeat({
    enabled: phase === 'active',
    event: selectedEvent,
    mode: 'person',
    zones: selectedZones,
    sectors: [],
    pendingCount: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.filter({ status: 'active' }, '-start_at', 100);
        setEvents(data);
      } catch {}
      setLoadingEvents(false);
    })();
  }, []);

  // Pre-selección de evento y zona desde la asignación remota del admin (Estaciones PDA).
  useEffect(() => {
    if (!pdaNumber || events.length === 0) return;
    (async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const withEvent = mine.find((s) => s.assigned_event_id && events.some((e) => e.id === s.assigned_event_id));
        if (withEvent) {
          if (!selectedEventId) setSelectedEventId(withEvent.assigned_event_id);
          if (withEvent.assigned_zone && selectedZones.length === 1 && selectedZones[0] === 'general') {
            const zs = withEvent.assigned_zone.split(',').map((z) => z.trim()).filter(Boolean);
            if (zs.length > 0) setSelectedZones(zs);
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdaNumber, events]);

  // Sincronización en vivo de la configuración remota (panel Estaciones PDA):
  // cada 10 segundos actualiza las zonas desde el backend mientras la estación
  // facial está activa, así los cambios del administrador aplican de inmediato.
  useEffect(() => {
    if (!pdaNumber || phase !== 'active') return;
    const sync = async () => {
      try {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 20);
        const st = mine.find((s) => s.assigned_event_id) || mine[0];
        if (!st) return;
        if (st.assigned_zone) {
          const zs = st.assigned_zone.split(',').map((z) => z.trim()).filter(Boolean);
          if (zs.length > 0) setSelectedZones(zs);
        }
      } catch {}
    };
    sync();
    const id = setInterval(sync, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdaNumber, phase]);

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
    setResult(null);
    setVerifying(false);
  };

  const handleCaptured = async (file, descriptor) => {
    setVerifying(true);
    setResult(null);
    try {
      const me = await base44.auth.me();
      const verifier = me?.full_name || me?.email || 'Sistema';

      const logAccess = async (result, accred = {}, extra = {}) => {
        await base44.entities.AccessLog.create({
          accreditation_id: accred.id || 'unknown',
          person_name: accred.person_name || extra.person_name || 'Desconocido',
          badge_code: accred.badge_code || '',
          event_name: selectedEvent.name,
          event_id: selectedEvent.id,
          company: accred.company || selectedEvent.company,
          verified_by: verifier,
          method: 'biometric',
          zone: selectedZones.join(', '),
          result,
          access_level: accred.access_level || '',
        });
      };

      // Validate event is within valid time window
      const status = getEventStatus(selectedEvent);
      if (status === 'upcoming' || status === 'ended') {
        await logAccess('denied');
        setResult({
          ok: false,
          message: status === 'upcoming' ? 'El evento aún no ha comenzado.' : 'El evento ha finalizado.',
        });
        return;
      }

      if (!descriptor) {
        await logAccess('denied');
        setResult({ ok: false, message: 'No se detectó un rostro humano en la captura.' });
        return;
      }

      // Fetch active accreditations for the SELECTED EVENT only
      const accreditations = await base44.entities.Accreditation.filter(
        { status: 'active', event_id: selectedEvent.id },
        '-created_date',
        500
      );
      const eventPersonIds = new Set(accreditations.map((a) => a.person_id));

      // Fetch biometrics only for persons with active accreditations in this event
      const bios = await base44.entities.Biometric.filter({ status: 'active' }, '-created_date', 500);
      const withDescriptors = bios.filter(
        (b) => b.face_descriptor && b.face_descriptor.length > 0 && eventPersonIds.has(b.person_id)
      );

      if (withDescriptors.length === 0) {
        await logAccess('denied');
        setResult({ ok: false, message: 'No hay rostros registrados para este evento.' });
        return;
      }

      // Find best match using face-api.js descriptors
      const { match, distance, topEntries } = findBestMatch(descriptor, withDescriptors);

      let matchedBio = match;

      // If descriptor didn't match, try LLM batch comparison with top candidates
      // (handles cases where descriptor quality is poor — DNI photos, lighting, angle, etc.)
      if (!matchedBio) {
        // Get top 8 candidates with photos (ranked by descriptor distance)
        let candidates = topEntries
          .slice(0, 8)
          .map((t) => t.entry)
          .filter((e) => e.face_photo_url);

        // If not enough from descriptor ranking, add remaining photo-only biometrics
        if (candidates.length < 8) {
          const existingIds = new Set(candidates.map((c) => c.id));
          const additional = bios
            .filter((b) => b.face_photo_url && !existingIds.has(b.id) && eventPersonIds.has(b.person_id))
            .slice(0, 8 - candidates.length);
          candidates = [...candidates, ...additional];
        }

        if (candidates.length > 0) {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });

          for (let i = 0; i < candidates.length; i += 8) {
            const batch = candidates.slice(i, i + 8);
            const fileUrls = [file_url, ...batch.map((b) => b.face_photo_url)];

            const llmResult = await base44.integrations.Core.InvokeLLM({
              model: 'claude_sonnet_4_6',
              prompt:
                `Sos un sistema de identificación biométrica facial. Vas a recibir ${batch.length + 1} imágenes.\n` +
                `IMAGEN 1 (índice 1): captura en vivo de una cámara.\n` +
                `IMÁGENES 2 a ${batch.length + 1}: fotos de registro de diferentes personas.\n\n` +
                `INSTRUCCIONES:\n` +
                `1. Verificá PRIMERO que la IMAGEN 1 contenga un ROSTRO HUMANO claramente visible y frontal. ` +
                `Si NO hay un rostro humano, devolvé match_index: 0 y confidence: 0.\n` +
                `2. Si hay un rostro humano, compará con CADA foto de registro analizando:\n` +
                `   - Forma y proporciones del rostro\n` +
                `   - Distancia entre ojos y posición relativa\n` +
                `   - Forma y tamaño de la nariz\n` +
                `   - Forma de la boca y grosor de labios\n` +
                `   - Cejas: forma, grosor, curvatura y posición\n` +
                `   - Línea mandibular y mentón\n` +
                `   - Color y estilo de cabello (si visible)\n` +
                `3. Solo devolvé un match_index distinto de 0 si estás MUY seguro de que es la misma persona. ` +
                `Ante la MÍNIMA duda, devolvé match_index: 0.\n` +
                `Respondé únicamente con el JSON.`,
              file_urls: fileUrls,
              response_json_schema: {
                type: 'object',
                properties: {
                  match_index: {
                    type: 'number',
                    description: 'Índice basado en 1 de la imagen que coincide, o 0 si no hay coincidencia',
                  },
                  confidence: { type: 'number', description: 'Nivel de confianza de 0 a 1' },
                },
                required: ['match_index', 'confidence'],
              },
            });

            const matchIndex = Number(llmResult.match_index) || 0;
            const confidence = Number(llmResult.confidence) || 0;
            if (matchIndex >= 2 && confidence >= 0.7) {
              matchedBio = batch[matchIndex - 2];
              break;
            }
          }
        }
      }

      if (!matchedBio) {
        await logAccess('denied');
        setResult({ ok: false, message: `No se encontró coincidencia facial (distancia: ${distance.toFixed(2)}).` });
        return;
      }

      // Find the active accreditation for this person in this event
      const accred = accreditations.find((a) => a.person_id === matchedBio.person_id);
      if (!accred) {
        await logAccess('denied', {}, { person_name: matchedBio.person_name });
        setResult({
          ok: false,
          message: 'Persona identificada pero sin acreditación para este evento.',
          person_name: matchedBio.person_name,
        });
        return;
      }

      const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');

      if (!canAccessAnyZone(accred.access_level, selectedZones)) {
        await logAccess('denied', accred);
        setResult({
          ok: false,
          person_name: accred.person_name,
          access_level: accred.access_level,
          event_phases: accred.event_phases || [],
          message: `Acceso restringido para la zona: ${zoneLabel}.`,
        });
        return;
      }

      if (!isWithinEventPhases(selectedEvent, accred.event_phases)) {
        await logAccess('denied', accred);
        setResult({
          ok: false,
          person_name: accred.person_name,
          access_level: accred.access_level,
          event_phases: accred.event_phases || [],
          message: 'Acceso fuera del rango de fechas autorizado para las fases asignadas.',
        });
        return;
      }

      await logAccess('granted', accred);
      setResult({ ok: true, person_name: accred.person_name, access_level: accred.access_level, event_phases: accred.event_phases || [], accred });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!result) return;
    speakResult(result.ok);
    const timer = setTimeout(() => {
      setResult(null);
      setCycle((c) => c + 1);
    }, 2500);
    return () => clearTimeout(timer);
  }, [result]);

  const eventStatus = selectedEvent ? getEventStatus(selectedEvent) : null;

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Estación de control</span>
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
                <h2 className="text-xl font-bold text-slate-900">Seleccionar evento</h2>
                <p className="text-sm text-slate-500">Elegí el evento para iniciar la estación de control.</p>
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
                  disabled={!selectedEventId || !pdaNumber || selectedZones.length === 0}
                  className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  Iniciar estación de control
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
                <p className="text-xs text-slate-500">{selectedEvent.venue || 'Sin sede'} · Zonas: {selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ')}</p>
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
              <h2 className="mb-1 text-xl font-bold text-slate-900">Identificación facial automática</h2>
              <p className="mb-5 text-sm text-slate-500">
                Mirá a la cámara. El sistema te identificará automáticamente al detectar tu rostro.
              </p>

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
                  <span className="mt-3 text-sm text-slate-500">Identificando…</span>
                </div>
              ) : !result ? (
                <FaceCapture key={cycle} onCaptured={handleCaptured} autoCapture />
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
          {result.person_name && (
            <p className="mt-3 text-lg text-white/80">{result.person_name}</p>
          )}
          {result.access_level && (() => {
            const lvl = zones.find((z) => z.value === result.access_level);
            return (
              <p className="mt-1 text-base font-semibold text-white/90">
                Nivel: {lvl?.label || result.access_level}
              </p>
            );
          })()}
          {(() => {
            const phases = result.event_phases || result.accred?.event_phases || [];
            if (phases.length === 0 && !result.accred) return null;
            return (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {phases.map((ph) => (
                  <span key={ph} className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/30">
                    ✓ {phaseLabel(ph)}
                  </span>
                ))}
              </div>
            );
          })()}
          {!result.ok && result.message && (
            <p className="mt-1 max-w-md px-6 text-center text-sm text-white/70">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}