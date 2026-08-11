import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, RefreshCw, Smartphone, Wifi, WifiOff, CloudUpload, Pencil, Trash2, X, Plus, Battery, BatteryFull, BatteryMedium, BatteryLow } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';

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
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const { zones } = useZones();
  const { sectors: parkingSectors } = useParkingSectors();

  const load = useCallback(async () => {
    try {
      const data = await base44.entities.PdaStation.list('-last_seen', 500);
      setStations(data || []);
    } catch {}
    setLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await base44.entities.Event.filter({ status: 'active' }, '-start_at', 100);
      setEvents(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadEvents();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load, loadEvents]);

  const now = Date.now();

  const openNew = () => { setSaveError(''); setEditing({ station_number: '', label: '', assigned_event_id: '', zones: [], assigned_sectors: [], admin_pin: '1234' }); };
  const openEdit = (s) => { setSaveError(''); setEditing({ id: s.id, station_number: s.station_number, label: s.label || '', assigned_event_id: s.assigned_event_id || '', zones: s.assigned_zone ? s.assigned_zone.split(',').map((z) => z.trim()).filter(Boolean) : [], assigned_sectors: s.assigned_sectors || [], admin_pin: s.admin_pin || '1234' }); };

  const saveEdit = async () => {
    if (!editing || !editing.station_number) return;
    setSaveError('');
    // Validar número único de PDA (no se pueden repetir identificadores)
    try {
      const existing = await base44.entities.PdaStation.filter({ station_number: editing.station_number }, '-created_date', 50);
      const dup = (existing || []).find((s) => s.id !== editing.id);
      if (dup) {
        setSaveError(`Ya existe una estación PDA con el número "${editing.station_number}". Cada PDA debe tener un número único.`);
        return;
      }
    } catch {
      setSaveError('No se pudo validar el número de estación. Reintentá.');
      return;
    }
    const evt = events.find((e) => e.id === editing.assigned_event_id);
    const payload = {
      station_number: editing.station_number,
      label: editing.label,
      assigned_event_id: editing.assigned_event_id || '',
      assigned_zone: (editing.zones || []).join(', '),
      assigned_sectors: editing.assigned_sectors || [],
      event_id: editing.assigned_event_id || '',
      event_name: evt?.name || '',
      company: evt?.company || '',
      admin_pin: editing.admin_pin || '1234',
    };
    setSaveError('');
    try {
      if (editing.id) {
        await base44.entities.PdaStation.update(editing.id, payload);
      } else {
        await base44.entities.PdaStation.create(payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setSaveError(err?.message || 'No se pudo guardar. Verificá permisos.');
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta estación PDA del monitoreo?')) return;
    try { await base44.entities.PdaStation.delete(id); load(); } catch {}
  };

  return (
    <div>
      <PageHeader kicker="Control de acceso" title="Estaciones PDA">
        <div className="flex items-center gap-2">
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> Nueva estación
          </button>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </PageHeader>

      <p className="mb-4 text-sm text-slate-500">
        Estado en vivo de las PDAs conectadas. Desde acá podés asignarle a cada PDA el <span className="font-semibold">evento</span> y la <span className="font-semibold">zona de acceso</span> que controlará: la PDA los tomará automáticamente al iniciar. Una PDA aparece <span className="font-semibold text-emerald-600">en línea</span> si reportó actividad en los últimos 90 segundos. Se actualiza cada 15 segundos.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : stations.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-12 text-center">
          <Smartphone className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No hay estaciones PDA registradas</p>
          <p className="mt-1 text-xs text-slate-400">Creá una estación con "Nueva estación" para pre-asignarle un evento y zona, o esperá a que un operador inicie un control desde su PDA.</p>
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
                <th className="px-4 py-3">Batería</th>
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
                    <td className="px-4 py-3 text-slate-600">{s.event_name || (s.assigned_event_id ? 'Asignado' : '—')}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.assigned_zone || '—'}
                      {(s.assigned_sectors || []).length > 0 && (
                        <div className="mt-0.5 text-xs text-amber-600">Estacionamiento: {s.assigned_sectors.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.operator_name || '—'}</td>
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
                          <Smartphone className="h-3.5 w-3.5" /> Sin conectar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.battery_level != null ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.battery_level > 50 ? 'text-emerald-600' : s.battery_level >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                          {s.battery_level > 50 ? <BatteryFull className="h-4 w-4" /> : s.battery_level >= 20 ? <BatteryMedium className="h-4 w-4" /> : <BatteryLow className="h-4 w-4" />}
                          {Math.round(s.battery_level)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
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
                      <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
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
              <h3 className="text-lg font-bold text-slate-900">{editing.id ? `Editar estación ${editing.station_number}` : 'Nueva estación PDA'}</h3>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Número de estación / PDA</label>
                <input type="text" inputMode="numeric" value={editing.station_number} onChange={(e) => setEditing({ ...editing, station_number: e.target.value.trim() })} style={{ textTransform: 'none' }} placeholder="Ej: 1" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" />
                <p className="mt-1 text-xs text-slate-400">Este número es el que el operador debe cargar en el módulo PDA ID del dispositivo para vincularlo. Podés editarlo cuando quieras.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre descriptivo</label>
                <input type="text" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} style={{ textTransform: 'none' }} placeholder="Ej: Puerta principal" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Evento asignado</label>
                <select value={editing.assigned_event_id} onChange={(e) => setEditing({ ...editing, assigned_event_id: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option value="">Sin asignar</option>
                  {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                </select>
                <p className="mt-1 text-xs text-slate-400">La PDA tomará este evento automáticamente al iniciar el control.</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Zona(s) de acceso asignada(s)</label>
                <p className="mb-2 text-xs text-slate-400">Seleccioná una o varias. La PDA las tomará automáticamente al iniciar.</p>
                <div className="flex flex-wrap gap-2">
                  {zones.map((z) => {
                    const active = (editing.zones || []).includes(z.value);
                    return (
                      <button key={z.value} type="button" onClick={() => setEditing({ ...editing, zones: active ? (editing.zones || []).filter((v) => v !== z.value) : [...(editing.zones || []), z.value] })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{z.label}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Estacionamiento(s) asignado(s)</label>
                <p className="mb-2 text-xs text-slate-400">Sectores de estacionamiento que controlará esta PDA (credenciales vehiculares).</p>
                {parkingSectors.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">No hay sectores configurados.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {parkingSectors.map((s) => {
                      const active = (editing.assigned_sectors || []).includes(s.value);
                      return (
                        <button key={s.value} type="button" onClick={() => setEditing({ ...editing, assigned_sectors: active ? (editing.assigned_sectors || []).filter((v) => v !== s.value) : [...(editing.assigned_sectors || []), s.value] })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{s.label}</button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Clave para administrar la PDA</label>
                <input type="text" value={editing.admin_pin || ''} onChange={(e) => setEditing({ ...editing, admin_pin: e.target.value.trim() })} style={{ textTransform: 'none' }} placeholder="1234" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500" />
                <p className="mt-1 text-xs text-slate-400">Clave que el operador debe ingresar en el dispositivo (módulo PDA ID) para cambiar el número de esta PDA. Por defecto: 1234.</p>
              </div>
            </div>
            {saveError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{saveError}</div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveEdit} disabled={!editing.station_number} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}