import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Camera,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  DoorOpen,
  Hand,
  ShieldCheck,
  X,
  ExternalLink,
} from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import { compareDescriptors, MATCH_THRESHOLD } from '@/lib/faceRecognition';
import { canAccessAnyZone } from '@/lib/accessZones';
import { useZones } from '@/lib/useZones';
import { speakResult } from '@/lib/accessUtils';
import { formatTime } from '@/lib/formatDate';

export default function AccessControl({ standalone = false }) {
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [selectedZones, setSelectedZones] = useState(['general']);
  const [badgeCode, setBadgeCode] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const { zones } = useZones();

  const loadEvents = async () => {
    try {
      const data = await base44.entities.Event.filter({ status: 'active' }, '-created_date', 50);
      setEvents(data);
    } catch {}
  };

  const loadRecent = useCallback(async () => {
    try {
      const data = await base44.entities.AccessLog.list('-created_date', 10);
      setRecent(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadEvents();
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!result) return;
    speakResult(result.ok);
    const timer = setTimeout(() => setResult(null), 2500);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (standalone && found?.has_biometric && !showCamera && !verifying && !result) {
      setShowCamera(true);
    }
  }, [standalone, found, showCamera, verifying, result]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!badgeCode.trim()) return;
    setSearching(true);
    setResult(null);
    setFound(null);
    try {
      const items = await base44.entities.Accreditation.filter({ badge_code: badgeCode.trim() }, '-created_date', 5);
      if (items.length === 0) {
        const me = await base44.auth.me();
        await base44.entities.AccessLog.create({
          accreditation_id: 'unknown',
          person_name: 'Desconocido',
          badge_code: badgeCode.trim(),
          event_name: '',
          event_id: eventFilter || '',
          company: events.find((e) => e.id === eventFilter)?.company || '',
          verified_by: me?.full_name || me?.email || 'Sistema',
          method: 'manual',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: '',
        });
        setResult({ ok: false, message: 'No se encontró ninguna acreditación con ese código.' });
      } else {
        const accred = items[0];
        if (accred.status !== 'active') {
          const me = await base44.auth.me();
          await base44.entities.AccessLog.create({
            accreditation_id: accred.id,
            person_name: accred.person_name,
            badge_code: accred.badge_code,
            event_name: accred.event_name,
            event_id: accred.event_id,
          company: accred.company,
            verified_by: me?.full_name || me?.email || 'Sistema',
            method: 'manual',
            zone: selectedZones.join(', '),
            result: 'denied',
            access_level: accred.access_level,
          });
          setResult({ ok: false, message: `Acreditación ${accred.status}. Acceso denegado.`, accred });
        } else {
          setFound(accred);
        }
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleFaceCaptured = async (file, descriptor) => {
    setVerifying(true);
    setResult(null);
    try {
      // Fetch the stored biometric for this person
      const bios = await base44.entities.Biometric.filter(
        { person_id: found.person_id, status: 'active' },
        '-created_date',
        1
      );

      if (bios.length === 0) {
        const me = await base44.auth.me();
        await base44.entities.AccessLog.create({
          accreditation_id: found.id,
          person_name: found.person_name,
          badge_code: found.badge_code,
          event_name: found.event_name,
          event_id: found.event_id,
          company: found.company,
          verified_by: me?.full_name || me?.email || 'Sistema',
          method: 'biometric',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: found.access_level,
        });
        setResult({ ok: false, message: 'Sin biometría registrada para esta persona.', accred: found });
        setFound(null);
        setBadgeCode('');
        await loadRecent();
        return;
      }

      const storedBio = bios[0];

      // Try fast client-side descriptor comparison first
      let descriptorMatch = false;
      if (descriptor && storedBio.face_descriptor && storedBio.face_descriptor.length > 0) {
        const distance = compareDescriptors(descriptor, storedBio.face_descriptor);
        descriptorMatch = distance < MATCH_THRESHOLD;
      }

      // If descriptor matched, handle zone check + log locally
      if (descriptorMatch) {
        const me = await base44.auth.me();
        const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');
        if (!canAccessAnyZone(found.access_level, selectedZones)) {
          await base44.entities.AccessLog.create({
            accreditation_id: found.id,
            person_name: found.person_name,
            badge_code: found.badge_code,
            event_name: found.event_name,
            event_id: found.event_id,
            company: found.company,
            verified_by: me?.full_name || me?.email || 'Sistema',
            method: 'biometric',
            zone: selectedZones.join(', '),
            result: 'denied',
            access_level: found.access_level,
          });
          setResult({ ok: false, message: `Acceso restringido para la zona: ${zoneLabel}.`, accred: found });
        } else {
          await base44.entities.AccessLog.create({
            accreditation_id: found.id,
            person_name: found.person_name,
            badge_code: found.badge_code,
            event_name: found.event_name,
            event_id: found.event_id,
            company: found.company,
            verified_by: me?.full_name || me?.email || 'Sistema',
            method: 'biometric',
            zone: selectedZones.join(', '),
            result: 'granted',
            access_level: found.access_level,
          });
          setResult({ ok: true, method: 'biometric', accred: found });
        }
        setFound(null);
        setBadgeCode('');
        await loadRecent();
        return;
      }

      // Descriptor didn't match or no descriptor — fall back to LLM visual comparison
      // (handles DNI-based biometrics where descriptor quality may be poor)
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const verifyRes = await base44.functions.invoke('faceVerify', {
        accreditation_id: found.id,
        captured_photo_url: file_url,
      });
      const llmVerified = verifyRes.data?.verified === true;

      if (llmVerified && canAccessAnyZone(found.access_level, selectedZones)) {
        // faceVerify already logged 'granted'
        setResult({ ok: true, method: 'biometric', accred: found });
      } else if (llmVerified) {
        // Face matched but zone denied — log the zone denial
        const me = await base44.auth.me();
        const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');
        await base44.entities.AccessLog.create({
          accreditation_id: found.id,
          person_name: found.person_name,
          badge_code: found.badge_code,
          event_name: found.event_name,
          event_id: found.event_id,
          company: found.company,
          verified_by: me?.full_name || me?.email || 'Sistema',
          method: 'biometric',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: found.access_level,
        });
        setResult({ ok: false, message: `Acceso restringido para la zona: ${zoneLabel}.`, accred: found });
      } else {
        // faceVerify already logged 'denied'
        setResult({
          ok: false,
          message: verifyRes.data?.reason || 'El rostro no coincide con el registrado.',
          accred: found,
        });
      }

      setFound(null);
      setBadgeCode('');
      await loadRecent();
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
      setShowCamera(false);
    }
  };

  const handleManual = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const me = await base44.auth.me();
      const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');
      if (!canAccessAnyZone(found.access_level, selectedZones)) {
        await base44.entities.AccessLog.create({
          accreditation_id: found.id,
          person_name: found.person_name,
          badge_code: found.badge_code,
          event_name: found.event_name,
          event_id: found.event_id,
          company: found.company,
          verified_by: me?.full_name || me?.email || 'Sistema',
          method: 'manual',
          zone: selectedZones.join(', '),
          result: 'denied',
          access_level: found.access_level,
        });
        setResult({ ok: false, message: `Acceso restringido para la zona: ${zoneLabel}.`, accred: found });
        setFound(null);
        setBadgeCode('');
        await loadRecent();
        return;
      }
      await base44.entities.AccessLog.create({
        accreditation_id: found.id,
        person_name: found.person_name,
        badge_code: found.badge_code,
        event_name: found.event_name,
        event_id: found.event_id,
          company: found.company,
        verified_by: me?.full_name || me?.email || 'Sistema',
        method: 'manual',
        zone: selectedZones.join(', '),
        result: 'granted',
        access_level: found.access_level,
      });
      setResult({ ok: true, method: 'manual', accred: found });
      setFound(null);
      setBadgeCode('');
      await loadRecent();
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Verificación de identidad</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Control de acceso</h1>
        </div>
        {!standalone && (
          <a href="/control-acceso" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <ExternalLink className="h-4 w-4" /> Abrir estación
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Verification panel */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Event filter */}
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Evento</label>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Todos los eventos</option>
                {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
              </select>
            </div>

            {/* Zone selector */}
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Zona(s) de control</label>
              <p className="mb-2 text-xs text-slate-400">Seleccioná una o varias. Se permite el ingreso si la persona tiene acceso a alguna de las seleccionadas.</p>
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                  const active = selectedZones.includes(z.value);
                  return (
                    <button
                      key={z.value}
                      type="button"
                      onClick={() => setSelectedZones((prev) => active ? prev.filter((v) => v !== z.value) : [...prev, z.value])}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {z.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Badge search */}
            <form onSubmit={handleSearch} className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Código de credencial</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={badgeCode}
                    onChange={(e) => setBadgeCode(e.target.value)}
                    placeholder="Ej: AC-001"
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <button type="submit" disabled={searching || !badgeCode.trim()}
                  className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </button>
              </div>
            </form>

            {/* Found accreditation */}
            {found && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{found.person_name}</p>
                    <p className="text-sm text-slate-500">{found.event_name} · {found.badge_code}</p>
                    <p className="mt-1 text-xs text-slate-400">{zones.find((z) => z.value === (found.access_level || found.area))?.label || found.access_level || found.area || 'Sin área'}</p>
                  </div>
                  {found.has_biometric ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <ShieldCheck className="h-3 w-3" /> Rostro registrado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      Sin biometría
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {found.has_biometric && (
                    <button onClick={() => setShowCamera(true)} disabled={verifying}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                      {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                      Verificar con cámara
                    </button>
                  )}
                  <button onClick={handleManual} disabled={verifying}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                    <Hand className="h-5 w-5" /> Acceso manual
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Recent accesses */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <DoorOpen className="h-4 w-4 text-emerald-600" /> Últimos ingresos
          </h3>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin ingresos registrados.</p>
          ) : (
            <div className="space-y-1">
              {recent.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-t border-slate-100 py-3 first:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{log.person_name || '—'}</p>
                    <p className="text-xs text-slate-400">
                      {log.method === 'biometric' ? 'Facial' : 'Manual'} · {log.event_name}
                      {log.zone ? ` · ${log.zone}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.result === 'denied' ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-200">Denegado</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200">OK</span>
                    )}
                    <time className="font-mono text-xs text-slate-400">
                      {formatTime(log.created_date)}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen result overlay */}
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
          {result.accred?.person_name && (
            <p className="mt-3 text-lg text-white/80">{result.accred.person_name}</p>
          )}
          {!result.ok && result.message && (
            <p className="mt-1 max-w-md px-6 text-center text-sm text-white/70">{result.message}</p>
          )}
          <p className="mt-10 text-xs text-white/50">Tocá para continuar</p>
        </div>
      )}

      {/* Camera modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
          <div className="my-8 w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Verificar rostro</h2>
                <p className="text-xs text-slate-500">{found?.person_name}</p>
              </div>
              <button onClick={() => setShowCamera(false)} disabled={verifying}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              {verifying ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                  <span className="mt-3 text-sm text-slate-500">Verificando rostro…</span>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-slate-500">
                    Pedile a la persona que mire a la cámara y capturá el rostro.
                  </p>
                  <FaceCapture onCaptured={handleFaceCaptured} autoCapture={standalone} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}