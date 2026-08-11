import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Smartphone, CheckCircle2, Wifi, WifiOff, RefreshCw, Lock, X } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import { usePdaNumber } from '@/hooks/usePdaRegistration';

const ONLINE_THRESHOLD_MS = 90 * 1000;

export default function PdaId() {
  const [pdaNumber, setPdaNumber] = usePdaNumber();
  const [draft, setDraft] = useState(pdaNumber);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [checkingPin, setCheckingPin] = useState(false);

  const load = useCallback(async () => {
    if (!pdaNumber) { setStations([]); return; }
    setLoading(true);
    try {
      const data = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 50);
      setStations(data || []);
    } catch {}
    setLoading(false);
  }, [pdaNumber]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const requestChange = () => {
    if (!draft.trim()) return;
    setPinInput('');
    setPinError('');
    setPinOpen(true);
  };

  const confirmChange = async () => {
    setPinError('');
    setCheckingPin(true);
    try {
      // La clave se valida contra la estación actualmente asignada a este
      // dispositivo (la que coincide con el número actual). Si no hay estación
      // o no tiene clave definida, se usa la clave por defecto 1234.
      let correctPin = '1234';
      if (pdaNumber) {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 5);
        if (mine && mine.length > 0 && mine[0].admin_pin) correctPin = mine[0].admin_pin;
      }
      if (pinInput.trim() !== correctPin) {
        setPinError('Clave incorrecta.');
        setCheckingPin(false);
        return;
      }
      setPdaNumber(draft.trim());
      setPinOpen(false);
    } catch {
      setPinError('No se pudo validar la clave. Reintentá.');
    }
    setCheckingPin(false);
  };

  const now = Date.now();

  return (
    <div>
      <PageHeader kicker="Control de acceso" title="PDA ID" />
      <p className="mb-5 text-sm text-slate-500">
        Este número identifica a la PDA en este dispositivo. Lo define el administrador desde el panel <span className="font-semibold">Estaciones PDA</span>; acá solo se carga una vez por dispositivo. Para cambiarlo se necesita la clave de administrador.
      </p>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Número de estación / PDA</label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
            placeholder="Ej: 1"
            style={{ textTransform: 'none' }}
            className="w-40 rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <button onClick={requestChange} disabled={draft === pdaNumber || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            <Lock className="h-4 w-4" /> Cambiar
          </button>
        </div>
        {pdaNumber && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> PDA #{pdaNumber} asignada a este dispositivo
          </p>
        )}
      </div>

      {pdaNumber && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Asignaciones de esta PDA</h2>
            <button onClick={load} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : stations.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center">
              <Smartphone className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-600">Sin asignaciones registradas</p>
              <p className="mt-1 text-xs text-slate-400">Cuando el administrador te asigne un evento/zona desde Estaciones PDA, aparecerá acá.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Evento</th>
                    <th className="px-4 py-3">Zona asignada</th>
                    <th className="px-4 py-3">Estacionamiento</th>
                    <th className="px-4 py-3">Modo</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stations.map((s) => {
                    const lastSeenMs = s.last_seen ? now - new Date(s.last_seen).getTime() : null;
                    const online = lastSeenMs != null && lastSeenMs < ONLINE_THRESHOLD_MS;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.event_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.assigned_zone || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{(s.assigned_sectors || []).length > 0 ? s.assigned_sectors.join(', ') : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.mode === 'vehicle' ? 'Vehicular' : 'Personal'}</td>
                        <td className="px-4 py-3">
                          {online ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              <Wifi className="h-3.5 w-3.5" /> En línea
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
                              <WifiOff className="h-3.5 w-3.5" /> Inactiva
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Popup de clave para cambiar el número de PDA */}
      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !checkingPin && setPinOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Lock className="h-5 w-5 text-emerald-600" /> Clave de administrador</h3>
              <button onClick={() => !checkingPin && setPinOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-sm text-slate-500">Ingresá la clave definida por el administrador en Estaciones PDA para cambiar el número de esta PDA.</p>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pinInput.trim()) confirmChange(); }}
              autoFocus
              placeholder="Clave"
              style={{ textTransform: 'none' }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-bold tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {pinError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{pinError}</div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPinOpen(false)} disabled={checkingPin} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmChange} disabled={checkingPin || !pinInput.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                {checkingPin ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}