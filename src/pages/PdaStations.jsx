import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, Smartphone, Wifi, WifiOff, CloudUpload, Pencil, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';

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

export default function PdaStations() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await base44.entities.PdaStation.list('-last_seen', 500);
      setStations(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const now = Date.now();

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await base44.entities.PdaStation.update(editing.id, {
        label: editing.label,
        assigned_zone: editing.assigned_zone,
      });
      setEditing(null);
      load();
    } catch {}
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta estación PDA del monitoreo?')) return;
    try { await base44.entities.PdaStation.delete(id); load(); } catch {}
  };

  return (
    <div>
      <PageHeader kicker="Control de acceso" title="Estaciones PDA">
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </PageHeader>

      <p className="mb-4 text-sm text-slate-500">
        Estado en vivo de las PDAs conectadas. Una PDA aparece <span className="font-semibold text-emerald-600">en línea</span> si reportó actividad en los últimos 90 segundos. Se actualiza automáticamente cada 15 segundos.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : stations.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-12 text-center">
          <Smartphone className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No hay estaciones PDA registradas</p>
          <p className="mt-1 text-xs text-slate-400">Cuando un operador inicie un control de acceso desde una PDA, aparecerá acá automáticamente.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Estación</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Zona asignada</th>
                <th className="px-4 py-3">Operador</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Última actividad</th>
                <th className="px-4 py-3">Pendientes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stations.map((s) => {
                const lastSeenMs = s.last_seen ? now - new Date(s.last_seen).getTime() : null;
                const online = lastSeenMs != null && lastSeenMs < ONLINE_THRESHOLD_MS;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-xs font-extrabold text-emerald-700">{s.station_number}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{s.label || `Estación ${s.station_number}`}</p>
                          <p className="text-xs text-slate-400">PDA {s.station_number} · {s.mode === 'vehicle' ? 'Vehicular' : 'Personal'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.event_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.assigned_zone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.operator_name || '—'}</td>
                    <td className="px-4 py-3">
                      {online ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Wifi className="h-3.5 w-3.5" /> En línea
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                          <WifiOff className="h-3.5 w-3.5" /> Offline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {lastSeenMs != null ? formatDuration(lastSeenMs) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.pending_sync > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <CloudUpload className="h-3.5 w-3.5" /> {s.pending_sync}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditing({ ...s })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(s.id)} className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Editar estación {editing.station_number}</h3>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre descriptivo</label>
                <input type="text" value={editing.label || ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} style={{ textTransform: 'none' }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Zona asignada</label>
                <input type="text" value={editing.assigned_zone || ''} onChange={(e) => setEditing({ ...editing, assigned_zone: e.target.value })} placeholder="Ej: general, backstage" style={{ textTransform: 'none' }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveEdit} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}