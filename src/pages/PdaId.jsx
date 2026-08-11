import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Smartphone, CheckCircle2, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import { usePdaNumber } from '@/hooks/usePdaRegistration';

const ONLINE_THRESHOLD_MS = 90 * 1000;

export default function PdaId() {
  const [pdaNumber, setPdaNumber] = usePdaNumber();
  const [draft, setDraft] = useState(pdaNumber);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const save = () => {
    setPdaNumber(draft.trim());
  };

  const now = Date.now();

  return (
    <div>
      <PageHeader kicker="Control de acceso" title="PDA ID" />
      <p className="mb-5 text-sm text-slate-500">
        Este número identifica a la PDA en este dispositivo para <span className="font-semibold">todos</span> los controles de acceso (facial, QR personas, QR vehículos y validación manual). Se setea una sola vez y se recuerda en este dispositivo.
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
          <button onClick={save} disabled={draft === pdaNumber} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            Guardar
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
              <p className="mt-1 text-xs text-slate-400">Cuando inicies un control o un administrador te asigne un evento/zona, aparecerá acá.</p>
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

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/control-acceso" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Control facial</Link>
        <Link to="/control-qr" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Control QR personas</Link>
        <Link to="/control-vehicular" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Control vehicular</Link>
        <Link to="/control-manual" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Validación manual</Link>
      </div>
    </div>
  );
}