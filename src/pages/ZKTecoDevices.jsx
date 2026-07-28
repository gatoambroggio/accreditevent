import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCrud } from '@/lib/crud';
import { base44 } from '@/api/base44Client';
import { Plus, Loader2, Cpu, Copy, RefreshCw, Pencil, Clock, Wifi, WifiOff, Server } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { useZones } from '@/lib/useZones';
import { toast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/page-header';
import DataTable, { Th } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';

export default function ZKTecoDevices() {
  const { items: devices, loading, create, update, remove } = useCrud('ZKTecoDevice');
  const { zones } = useZones();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [events, setEvents] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [commands, setCommands] = useState([]);

  const fetchCommands = useCallback(async () => {
    try {
      const cmds = await base44.entities.ZKTecoCommand.list('-created_date', 200);
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
    'zk_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);

  const fields = useMemo(
    () => [
      { name: 'name', label: 'Nombre del dispositivo', type: 'text', required: true, full: true, placeholder: 'Ej: Acceso Principal' },
      { name: 'serial_number', label: 'Número de serie (SN)', type: 'text', required: true, placeholder: 'Ej: BGF823456789' },
      { name: 'api_key', label: 'API Key', type: 'text', required: true, hint: 'Se genera automáticamente. Pegala en la URL de push del dispositivo.' },
      {
        name: 'zone', label: 'Zona(s) de acceso', type: 'toggle-group', full: true,
        options: zones.map((z) => ({ value: z.value, label: z.label })),
      },
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
    setEditing({ api_key: generateApiKey(), status: 'active' });
    setModalOpen(true);
  };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleSubmit = async (data) => {
    const evt = events.find((e) => e.id === data.event_id);
    const enriched = { ...data, event_name: evt?.name || '' };
    if (editing?.id) await update(editing.id, enriched);
    else await create(enriched);
  };

  const handleDelete = async () => { await remove(editing.id); };

  const handleSync = async (device) => {
    setSyncingId(device.id);
    try {
      const filter = { status: 'active' };
      if (device.event_id) filter.event_id = device.event_id;
      const accreds = await base44.entities.Accreditation.filter(filter, '-created_date', 500);

      if (accreds.length === 0) {
        toast({ title: 'Sin acreditaciones', description: 'No hay personas acreditadas para sincronizar.' });
        return;
      }

      const allPeople = await base44.entities.Person.list('-created_date', 500);

      const cmds = accreds.map((a) => {
        const person = allPeople.find((p) => p.id === a.person_id);
        const pin = (person?.document || a.badge_code || '').replace(/\D/g, '') || '1';
        const name = person?.full_name || a.person_name || 'Usuario';
        return {
          device_id: device.id,
          command_type: 'sync_user',
          command_data: `USER\tPIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceFlag=0\tVersion=0`,
          person_id: a.person_id,
          person_name: name,
          status: 'pending',
        };
      });

      await base44.entities.ZKTecoCommand.bulkCreate(cmds);
      toast({ title: 'Sincronización encolada', description: `${cmds.length} usuarios serán enviados al dispositivo.` });
      fetchCommands();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingId(null);
    }
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copiado', description: 'API key copiada al portapapeles.' });
  };

  const pendingCount = (id) => commands.filter((c) => c.device_id === id && c.status === 'pending').length;

  const lastSeenLabel = (d) => {
    if (!d.last_seen) return 'Nunca';
    const diff = Date.now() - new Date(d.last_seen).getTime();
    if (diff < 60000) return 'Hace instantes';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    return new Date(d.last_seen).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Hardware" title="Terminales ZKTeco">
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo dispositivo
        </button>
      </PageHeader>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Cómo configurar tu SpeedFace</p>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-xs text-slate-500">
              <li>Registrá el dispositivo acá (se genera una API key automáticamente)</li>
              <li>En el menú del SpeedFace: <strong>Comunicación → Push</strong></li>
              <li>URL del servidor: la URL de la función <code className="rounded bg-white px-1 py-0.5 text-xs">zktecoWebhook</code> (desde el dashboard de Base44) + <code className="rounded bg-white px-1 py-0.5 text-xs">?key=TU_API_KEY</code></li>
              <li>Protocolo: HTTP · Activar <strong>Real-Time Push</strong></li>
              <li>Guardá y reiniciá el dispositivo</li>
              <li>Usá el botón <strong>Sync usuarios</strong> para enviar las personas acreditadas a la terminal</li>
            </ol>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Cpu className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">No hay dispositivos registrados todavía.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const pending = pendingCount(d.id);
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
                      <p className="font-mono text-[10px] text-slate-400">SN: {d.serial_number}</p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>

                <div className="mt-4 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">Zona(s)</span><span className="ml-2 truncate text-right font-medium text-slate-600">{d.zone ? d.zone.split(',').map((v) => zones.find((z) => z.value === v.trim())?.label || v.trim()).join(', ') : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Evento</span><span className="ml-2 truncate max-w-[150px] font-medium text-slate-600">{d.event_name || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Última conexión</span><span className="font-medium text-slate-600">{lastSeenLabel(d)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Comandos pendientes</span><span className={`font-bold ${pending > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{pending}</span></div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <code className="flex-1 truncate font-mono text-[10px] text-slate-500">{d.api_key}</code>
                  <button onClick={() => copyKey(d.api_key)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-emerald-600">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleSync(d)} disabled={syncingId === d.id}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                    {syncingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {syncingId === d.id ? 'Sincronizando…' : 'Sync usuarios'}
                  </button>
                  <button onClick={() => openEdit(d)} className={btnIcon}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {commands.filter((c) => c.status === 'pending').length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Clock className="h-4 w-4 text-amber-500" /> Comandos pendientes de envío
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <Th>Dispositivo</Th>
                  <Th>Persona</Th>
                  <Th>Tipo</Th>
                </tr>
              </thead>
              <tbody>
                {commands.filter((c) => c.status === 'pending').slice(0, 10).map((c) => {
                  const dev = devices.find((d) => d.id === c.device_id);
                  return (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600">{dev?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.person_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.command_type === 'sync_user' ? 'Sincronizar usuario' : c.command_type}</td>
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
        title={editing?.id ? 'Editar dispositivo' : 'Nuevo dispositivo'}
        kicker={editing?.id ? 'EDITAR DISPOSITIVO' : 'NUEVO DISPOSITIVO'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing?.id ? handleDelete : null}
        canDelete={!!editing?.id}
        submitLabel={editing?.id ? 'Guardar cambios' : 'Registrar dispositivo'}
      />
    </div>
  );
}