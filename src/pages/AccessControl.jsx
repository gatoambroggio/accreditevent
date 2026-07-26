import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  Fingerprint,
  Loader2,
  Search,
  CheckCircle2,
  XCircle,
  DoorOpen,
  Hand,
  ShieldCheck,
} from 'lucide-react';

export default function AccessControl() {
  const [events, setEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState('');
  const [badgeCode, setBadgeCode] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); // { ok: boolean, person, method }
  const [recent, setRecent] = useState([]);

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

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!badgeCode.trim()) return;
    setSearching(true);
    setResult(null);
    setFound(null);
    try {
      const items = await base44.entities.Accreditation.filter({ badge_code: badgeCode.trim() }, '-created_date', 5);
      if (items.length === 0) {
        setResult({ ok: false, message: 'No se encontró ninguna acreditación con ese código.' });
      } else {
        const accred = items[0];
        if (accred.status !== 'active') {
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

  const handleBiometric = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const me = await base44.auth.me();

      const beginRes = await base44.functions.invoke('webauthnVerify', {
        step: 'begin',
        accreditation_id: found.id,
        origin: window.location.origin,
      });

      const assertionResponse = await startAuthentication({
        optionsJSON: beginRes.data.options,
      });

      const finishRes = await base44.functions.invoke('webauthnVerify', {
        step: 'finish',
        accreditation_id: found.id,
        person_name: found.person_name,
        badge_code: found.badge_code,
        event_name: found.event_name,
        verified_by: me?.full_name || me?.email || 'Sistema',
      });

      if (finishRes.data.verified) {
        setResult({ ok: true, method: 'biometric', accred: found });
        setFound(null);
        setBadgeCode('');
        await loadRecent();
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setResult({ ok: false, message: 'Verificación biométrica cancelada.' });
      } else {
        setResult({ ok: false, message: err.message || 'Error en la verificación biométrica.' });
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleManual = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const me = await base44.auth.me();
      await base44.entities.AccessLog.create({
        accreditation_id: found.id,
        person_name: found.person_name,
        badge_code: found.badge_code,
        event_name: found.event_name,
        verified_by: me?.full_name || me?.email || 'Sistema',
        method: 'manual',
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
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Verificación de identidad</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Control de acceso</h1>
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
                    <p className="mt-1 text-xs text-slate-400">{found.area || 'Sin área'} · {found.access_level}</p>
                  </div>
                  {found.has_biometric ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <ShieldCheck className="h-3 w-3" /> Biométrico activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      Sin biometría
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {found.has_biometric && (
                    <button onClick={handleBiometric} disabled={verifying}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                      {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
                      Verificar con biometría
                    </button>
                  )}
                  <button onClick={handleManual} disabled={verifying}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                    <Hand className="h-5 w-5" /> Acceso manual
                  </button>
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className={`mt-4 flex items-center gap-3 rounded-xl p-5 ${result.ok ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-red-50 ring-1 ring-red-200'}`}>
                {result.ok ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="text-base font-bold text-emerald-800">Acceso concedido</p>
                      <p className="text-sm text-emerald-600">
                        {result.accred?.person_name} — verificado por {result.method === 'biometric' ? 'biometría' : 'control manual'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-base font-bold text-red-800">Acceso denegado</p>
                      <p className="text-sm text-red-600">{result.message}</p>
                    </div>
                  </>
                )}
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
                      {log.method === 'biometric' ? 'Biométrico' : 'Manual'} · {log.event_name}
                    </p>
                  </div>
                  <time className="font-mono text-xs text-slate-400">
                    {new Date(log.created_date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}