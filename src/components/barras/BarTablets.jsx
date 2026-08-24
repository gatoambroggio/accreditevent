import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, Wine, Wifi, WifiOff, BatteryFull, BatteryMedium, BatteryLow, AlertTriangle, Trash2, X, Tablet, CloudUpload } from 'lucide-react';

const ONLINE_THRESHOLD_MS = 90 * 1000;

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `hace ${h}h ${m}m`;
}

export default function BarTablets() {
  const [tablets, setTablets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [toasts, setToasts] = useState([]);
  const dismissedRef = useRef(new Set());

  const evaluateAlerts = useCallback((data) => {
    const now = Date.now();
    const alerts = {};
    (data || []).forEach((t) => {
      const lastSeenMs = t.last_seen ? now - new Date(t.last_seen).getTime() : null;
      const online = lastSeenMs != null && lastSeenMs < ONLINE_THRESHOLD_MS;
      const offline = !online;
      const lowBattery = t.battery_level != null && t.battery_level <= 15 && !t.charging;
      if (offline || lowBattery) alerts[t.id] = { t, offline, lastSeenMs };
    });
    dismissedRef.current.forEach((tid) => { if (!alerts[tid]) dismissedRef.current.delete(tid); });
    setToasts((cur) => {
      const activeIds = new Set(Object.keys(alerts));
      const kept = cur.filter((to) => activeIds.has(to.tabletId) && !dismissedRef.current.has(to.tabletId));
      const existingIds = new Set(kept.map((to) => to.tabletId));
      const additions = [];
      Object.entries(alerts).forEach(([tid, a]) => {
        if (existingIds.has(tid) || dismissedRef.current.has(tid)) return;
        const offline = a.offline;
        const name = a.t.alias || a.t.bar_name || 'Tablet';
        const title = offline ? 'Tablet desconectada' : 'Batería baja';
        const message = offline
          ? `${name}${a.t.bar_name ? ' · ' + a.t.bar_name : ''} ${a.lastSeenMs != null ? 'perdió conexión.' : 'sin conectar.'}`
          : `${name}${a.t.bar_name ? ' · ' + a.t.bar_name : ''} tiene ${Math.round(a.t.battery_level)}% de batería.`;
        additions.push({ id: `toast-${tid}-${now}`, tabletId: tid, severity: offline ? 'error' : 'warning', icon: offline ? 'offline' : 'battery', title, message });
      });
      return [...kept, ...additions];
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await base44.entities.BarTablet.list('-last_seen', 500);
      setTablets(data || []);
      evaluateAlerts(data || []);
    } catch {}
    setLoading(false);
  }, [evaluateAlerts]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const now = Date.now();
  const offlineTablets = tablets.filter((t) => {
    if (!t.last_seen) return false;
    return (now - new Date(t.last_seen).getTime()) >= ONLINE_THRESHOLD_MS;
  });
  const showOfflinePopup = offlineTablets.length > 0 && !offlineDismissed;
  useEffect(() => { if (offlineTablets.length === 0) setOfflineDismissed(false); }, [offlineTablets.length]);

  const dismissToast = (toastId, tabletId) => {
    if (tabletId) dismissedRef.current.add(tabletId);
    setToasts((cur) => cur.filter((to) => to.id !== toastId));
  };

  const remove = async (t) => {
    if (!confirm(`¿Eliminar la tablet "${t.alias || t.bar_name}" del monitoreo?`)) return;
    try { await base44.entities.BarTablet.delete(t.id); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Tablets de barra</h2>
          <p className="text-sm text-slate-500">Monitoreo en vivo de las tablets que están corriendo el POS. Una tablet aparece en línea si reportó actividad en los últimos 90 segundos. Se actualiza cada 15 segundos.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
      ) : tablets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Tablet className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No hay tablets registradas todavía</p>
          <p className="mt-1 text-xs text-slate-400">Las tablets aparecen acá automáticamente cuando un operador abre el POS en la tablet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Tablet</th>
                <th className="px-4 py-3">Barra</th>
                <th className="px-4 py-3">Operador</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Batería</th>
                <th className="px-4 py-3">Última actividad</th>
                <th className="px-4 py-3">Pendientes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tablets.map((t) => {
                const lastSeenMs = t.last_seen ? now - new Date(t.last_seen).getTime() : null;
                const online = lastSeenMs != null && lastSeenMs < ONLINE_THRESHOLD_MS;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Tablet className="h-4 w-4" /></span>
                        <div>
                          <p className="font-semibold text-slate-900">{t.alias || 'Tablet'}</p>
                          <p className="text-xs text-slate-400 font-mono">{(t.device_id || '').slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.bar_name || '—'}{t.event_name ? <div className="text-xs text-slate-400">{t.event_name}</div> : null}</td>
                    <td className="px-4 py-3 text-slate-600">{t.operator_name || '—'}</td>
                    <td className="px-4 py-3">
                      {online ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Wifi className="h-3.5 w-3.5" /> En línea
                        </span>
                      ) : lastSeenMs != null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                          <WifiOff className="h-3.5 w-3.5" /> Offline
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200">
                          <Tablet className="h-3.5 w-3.5" /> Sin conectar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.battery_level != null ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${t.battery_level > 50 ? 'text-emerald-600' : t.battery_level >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                          {t.battery_level > 50 ? <BatteryFull className="h-4 w-4" /> : t.battery_level >= 20 ? <BatteryMedium className="h-4 w-4" /> : <BatteryLow className="h-4 w-4" />}
                          {Math.round(t.battery_level)}%{t.charging && <span className="text-emerald-500">⚡</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{lastSeenMs != null ? formatDuration(lastSeenMs) : '—'}</td>
                    <td className="px-4 py-3">
                      {t.pending_sync > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><CloudUpload className="h-3.5 w-3.5" /> {t.pending_sync}</span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(t)} title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showOfflinePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">Tablets offline</h3>
            </div>
            <p className="mb-4 text-sm text-slate-500">Las siguientes tablets de barra perdieron conexión (sin heartbeat reciente):</p>
            <ul className="mb-4 max-h-60 space-y-1.5 overflow-y-auto">
              {offlineTablets.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-900">{t.alias || 'Tablet'}{t.bar_name ? ` · ${t.bar_name}` : ''}</span>
                  <span className="text-xs font-semibold text-red-600">hace {Math.max(1, Math.round((now - new Date(t.last_seen).getTime()) / 60000))} min</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOfflineDismissed(true)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cerrar</button>
              <button onClick={() => setOfflineDismissed(true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Entendido</button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-ups (toasts) abajo a la derecha: desconexión y batería baja */}
      <div className="fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2">
        {toasts.map((to) => (
          <div key={to.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${to.severity === 'error' ? 'border-red-200 bg-white' : 'border-amber-200 bg-white'}`}>
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${to.severity === 'error' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              {to.icon === 'battery' ? <BatteryLow className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </span>
            <div className="min-w0 flex-1">
              <p className="text-sm font-bold text-slate-900">{to.title}</p>
              <p className="text-xs text-slate-500">{to.message}</p>
            </div>
            <button onClick={() => dismissToast(to.id, to.tabletId)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}