import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCrud } from '@/lib/crud';
import { base44 } from '@/api/base44Client';
import { Plus, Loader2, Cpu, Copy, RefreshCw, Pencil, Lock, Wifi, WifiOff, Server, AlertTriangle, DoorOpen, Power, KeyRound } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { useZones } from '@/lib/useZones';
import { toast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/page-header';
import DataTable, { Th } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';

export default function DahuaDevices() {
  const { items: devices, loading, create, update, remove } = useCrud('DahuaDevice');
  const { zones } = useZones();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [events, setEvents] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [commands, setCommands] = useState([]);
  const [actioning, setActioning] = useState(null); // {id, type}

  const fetchCommands = useCallback(async () => {
    try {
      const cmds = await base44.entities.DahuaCommand.list('-created_date', 200);
      setCommands(cmds);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const evs = await base44.entities.Event.list('-created_date', 100);
        setEvents(evs);
      } catch {}
    })();
    fetchCommands();
  }, [fetchCommands, devices]);

  const generateApiKey = () =>
    'dahua_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);

  const fields = useMemo(
    () => [
      { name: 'name', label: 'Nombre del dispositivo', type: 'text', required: true, full: true, placeholder: 'Ej: Acceso Principal' },
      { name: 'serial_number', label: 'Número de serie (SN)', type: 'text', placeholder: 'Ej: 5K0ABCDXYZ' },
      { name: 'ip', label: 'IP de la terminal', type: 'text', required: true, placeholder: 'Ej: 192.168.1.50' },
      { name: 'port', label: 'Puerto HTTP', type: 'number', placeholder: '80', hint: '80 por defecto' },
      { name: 'username', label: 'Usuario', type: 'text', required: true, placeholder: 'admin' },
      { name: 'password', label: 'Contraseña', type: 'password', required: true, placeholder: 'Contraseña de admin de la terminal' },
      { name: 'api_key', label: 'API Key (webhook)', type: 'text', required: true, hint: 'Se genera automáticamente. Se usa en la URL de push de la terminal.' },
      {
        name: 'zone', label: 'Zona(s) de acceso', type: 'toggle-group', full: true,
        options: zones.map((z) => ({ value: z.value, label: z.label })),
      },
      { name: 'door_channel', label: 'Canal de puerta (apertura remota)', type: 'number', placeholder: '0', hint: 'Puerta que controla la terminal (0 por defecto).' },
      {
        name: 'event_id', label: 'Evento asociado', type: 'select',
        options: events.map((e) => ({ value: e.id, label: e.name })),
      },
      {
        name: 'status', label: 'Estado', type: 'select',
        options: [
          { value: 'active', label: 'Activo' },
          { value: 'inactive', label: 'Inactivo' },
        ],
      },
    ],
    [zones, events]
  );

  const openNew = () => {
    setEditing({ api_key: generateApiKey(), port: 80, username: 'admin', door_channel: 0, status: 'active' });
    setModalOpen(true);
  };
  const openEdit = (item) => { setEditing({ ...item, password: item.password || '' }); setModalOpen(true); };

  const handleSubmit = async (data) => {
    const evt = events.find((e) => e.id === data.event_id);
    const enriched = {
      ...data,
      port: Number(data.port) || 80,
      door_channel: Number(data.door_channel) || 0,
      event_name: evt?.name || '',
    };
    if (editing?.id) await update(editing.id, enriched);
    else await create(enriched);
  };

  const handleDelete = async () => { await remove(editing.id); };

  const handleSync = async (device) => {
    setSyncingId(device.id);
    try {
      const res = await base44.functions.invoke('dahuaSyncUsers', { device_id: device.id });
      const d = res?.data ?? res;
      if (d?.error) throw new Error(d.error);
      toast({
        title: 'Sincronización completa',
        description: `${d.synced} usuarios enviados, ${d.failed} fallidos de ${d.total} acreditaciones.`,
        variant: d.failed > 0 ? 'destructive' : 'default',
      });
      fetchCommands();
    } catch (err) {
      toast({ title: 'Error de sync', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleAction = async (device, action) => {
    const label = action === 'open_door' ? 'abrir la puerta' : action === 'reboot' ? 'reiniciar la terminal' : 'verificar estado';
    if (action === 'open_door' && !window.confirm(`¿Abrir la puerta de "${device.name}" de forma remota?`)) return;
    if (action === 'reboot' && !window.confirm(`¿Reiniciar la terminal "${device.name}"?`)) return;
    setActioning({ id: device.id, type: action });
    try {
      const res = await base44.functions.invoke('dahuaRemoteAction', { device_id: device.id, action, channel: device.door_channel });
      const d = res?.data ?? res;
      if (d?.error) throw new Error(d.error);
      if (action === 'status') {
        toast({ title: 'Conexión OK', description: `Terminal respondió: ${(d.text || '').slice(0, 60)}…` });
      } else {
        toast({ title: 'Acción ejecutada', description: `Se solicitó ${label}.` });
      }
      fetchCommands();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copiado', description: 'API key copiada al portapapeles.' });
  };

  const pendingCount = (id) => commands.filter((c) => c.device_id === id && c.status === 'pending').length;
  const failedCount = (id) => commands.filter((c) => c.device_id === id && c.status === 'failed').length;

  const lastSeenLabel = (d) => {
    if (!d.last_seen) return 'Nunca';
    const diff = Date.now() - new Date(d.last_seen).getTime();
    if (diff < 60000) return 'Hace instantes';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    return new Date(d.last_seen).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Hardware" title="Terminales Dahua">
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo dispositivo
        </button>
      </PageHeader>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Cómo configurar tu terminal Dahua (ASI6214J)</p>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-xs text-slate-500">
              <li>Registrá el dispositivo acá con su IP, usuario y contraseña de admin (se genera una API key)</li>
              <li>En la web local de la terminal: <strong>Red → Servidor → Event Center Server</strong> (o <strong>HTTP Push</strong>)</li>
              <li>URL del servidor: la URL de la función <code className="rounded bg-white px-1 py-0.5 text-xs">dahuaWebhook</code> + <code className="rounded bg-white px-1 py-0.5 text-xs">?key=TU_API_KEY&amp;sn=TU_SN</code></li>
              <li>Protocolo: HTTP · Activar push de eventos de acceso</li>
              <li>Guardá y reiniciá la terminal</li>
              <li>Usá <strong>Sync usuarios</strong> para enviar el personal acreditado (con su rostro) a la terminal</li>
              <li>Usá <strong>Abrir puerta</strong> para apertura remota y <strong>Verificar</strong> para probar la conexión</li>
            </ol>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Cpu className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">No hay terminales Dahua registradas todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const pending = pendingCount(d.id);
            const failed = failedCount(d.id);
            const online = d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 120000;
            return (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${online ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      {online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{d.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{d.ip}:{d.port || 80} · SN {d.serial_number || '—'}</p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                <div className="mt-4 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Zona(s)</span><span className="ml-2 truncate text-right font-medium text-slate-600">{d.zone ? d.zone.split(',').map((v) => zones.find((z) => z.value === v.trim())?.label || v.trim()).join(', ') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Evento</span><span className="ml-2 truncate max-w-[150px] font-medium text-slate-600">{d.event_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Última conexión</span><span className="font-medium text-slate-600">{lastSeenLabel(d)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Comandos</span><span className="font-bold text-slate-600">{pending > 0 && <span className="text-amber-600">{pending} pend. · </span>}{failed > 0 && <span className="text-red-600">{failed} fall. · </span>}<span className="text-slate-500">OK</span></span></div>
                </div>

                {d.last_error && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.last_error}</span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <code className="flex-1 truncate font-mono text-[10px] text-slate-500">{d.api_key}</code>
                  <button onClick={() => copyKey(d.api_key)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-emerald-600">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => handleSync(d)} disabled={syncingId === d.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                    {syncingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {syncingId === d.id ? 'Sync…' : 'Sync usuarios'}
                  </button>
                  <button onClick={() => handleAction(d, 'open_door')} disabled={actioning?.id === d.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                    {actioning?.id === d.id && actioning?.type === 'open_door' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DoorOpen className="h-3.5 w-3.5" />}
                    Abrir puerta
                  </button>
                  <button onClick={() => handleAction(d, 'status')} disabled={actioning?.id === d.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                    {actioning?.id === d.id && actioning?.type === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                    Verificar
                  </button>
                  <button onClick={() => handleAction(d, 'reboot')} disabled={actioning?.id === d.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50">
                    {actioning?.id === d.id && actioning?.type === 'reboot' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    Reiniciar
                  </button>
                </div>

                <div className="mt-2 flex justify-end">
                  <button onClick={() => openEdit(d)} className={btnIcon}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {commands.filter((c) => c.status !== 'pending').length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Lock className="h-4 w-4 text-amber-500" /> Últimos comandos ejecutados
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <Th>Dispositivo</Th>
                  <Th>Persona</Th>
                  <Th>Tipo</Th>
                  <Th>Estado</Th>
                  <Th>Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {commands.filter((c) => c.status !== 'pending').slice(0, 12).map((c) => {
                  const dev = devices.find((d) => d.id === c.device_id);
                  return (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600">{dev?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.person_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.command_type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${c.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>
                          {c.status === 'delivered' ? 'OK' : 'Falló'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-400 max-w-[200px] truncate">{c.result || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing?.id ? 'Editar terminal' : 'Nueva terminal Dahua'}
        kicker={editing?.id ? 'EDITAR TERMINAL' : 'NUEVA TERMINAL'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing?.id ? handleDelete : null}
        canDelete={!!editing?.id}
        submitLabel={editing?.id ? 'Guardar cambios' : 'Registrar terminal'}
      />
    </div>
  );
}