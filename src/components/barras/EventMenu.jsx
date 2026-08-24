import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Pencil, UtensilsCrossed } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import EventProductEditorModal from './EventProductEditorModal';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

// Catálogo de productos base del evento. Al crear una barra se copia
// automáticamente; cada barra puede ajustar sus propios precios (VIP, etc.).
export default function EventMenu({ event }) {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    if (!event?.id) return;
    setLoading(true);
    try {
      const ps = await base44.entities.EventProduct.filter({ event_id: event.id }, 'sort_order', 300);
      setProducts(ps);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [event?.id, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (p) => {
    try {
      const clean = {
        ...p,
        event_id: event.id,
        event_name: event.name,
        company: event.company,
        price: Number(p.price),
        sort_order: Number(p.sort_order || 0),
      };
      if (p.id) await base44.entities.EventProduct.update(p.id, clean);
      else await base44.entities.EventProduct.create(clean);
      setModal(null);
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const remove = async (p) => {
    if (!confirm(`¿Eliminar "${p.name}" del catálogo del evento?`)) return;
    try { await base44.entities.EventProduct.delete(p.id); await load(); }
    catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><UtensilsCrossed className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Menú del evento</h3>
            <p className="text-xs text-slate-500">Catálogo base. Las barras nuevas lo copian automáticamente; cada barra puede ajustar precios (VIP, etc.).</p>
          </div>
        </div>
        <button onClick={() => setModal({ name: '', category: '', price: 0, sort_order: products.length, status: 'active' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Agregar producto
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Sin productos en el catálogo. Agregá los que se venden en el evento.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-bold text-slate-800">{p.name} {p.status === 'inactive' && <span className="text-xs text-slate-400">(inactivo)</span>}</p>
                <p className="text-xs text-slate-500">{p.category ? `${p.category} · ` : ''}{fmtCur(p.price)}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setModal(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <EventProductEditorModal product={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}