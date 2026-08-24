import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Cpu, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import BarPosDeviceModal from '@/components/barras/BarPosDeviceModal';

export default function BarPosDevices({ bar }) {
  const { toast } = useToast();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.BarPosDevice.filter({ bar_id: bar.id }, 'alias', 50);
      setDevices(list);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { if (bar?.id) load(); }, [bar?.id]);

  const save = async (d) => {
    try {
      const clean = {
        ...d,
        bar_id: bar.id,
        bar_name: bar.name,
        event_id: bar.event_id,
        event_name: bar.event_name,
        company: bar.company,
      };
      if (d.id) await base44.entities.BarPosDevice.update(d.id, clean);
      else await base44.entities.BarPosDevice.create(clean);
      setModal(null);
      await load();
      toast({ title: 'Terminal guardada' });
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const remove = async (d) => {
    if (!confirm(`¿Eliminar la terminal "${d.alias}"?`)) return;
    try {
      await base44.entities.BarPosDevice.delete(d.id);
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <Cpu className="h-4 w-4 text-emerald-600" /> Terminales Mercado Pago Point
        </h4>
        <button
          onClick={() => setModal({ device_id: '', alias: '', status: 'active' })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> Agregar terminal
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Cada terminal Point vinculada a esta barra. El operador elige cuál usar al cobrar con tarjeta. Sin terminales cargadas, el cobro con tarjeta no estará disponible.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">Sin terminales. Cargá el device ID desde el panel de Mercado Pago.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{d.alias}</p>
                <p className="truncate text-xs font-mono text-slate-500">{d.device_id}</p>
                {d.status === 'inactive' && <span className="text-[10px] font-semibold text-amber-600">INACTIVA</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setModal(d)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(d)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <BarPosDeviceModal device={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}