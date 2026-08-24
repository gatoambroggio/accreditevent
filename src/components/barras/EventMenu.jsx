import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Pencil, UtensilsCrossed, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import EventProductEditorModal from './EventProductEditorModal';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Catálogo de productos del evento + sectores/ubicaciones. Todas las barras
// usan este menú; en el POS se elige el sector con un selector y cambian los precios.
export default function EventMenu({ event }) {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSectors, setSavingSectors] = useState(false);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    if (!event?.id) return;
    setLoading(true);
    try {
      const ps = await base44.entities.EventProduct.filter({ event_id: event.id }, 'sort_order', 300);
      setProducts(ps);
      setSectors(event.bar_sectors || []);
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [event?.id, event?.bar_sectors, toast]);

  useEffect(() => { load(); }, [load]);

  const addSector = () => setSectors([...sectors, { value: '', label: '' }]);
  const updSector = (i, key, val) => {
    const arr = [...sectors];
    arr[i] = { ...arr[i], [key]: val };
    if (key === 'label' && !arr[i].value) arr[i].value = slug(val);
    setSectors(arr);
  };
  const delSector = (i) => setSectors(sectors.filter((_, idx) => idx !== i));

  const saveSectors = async () => {
    setSavingSectors(true);
    try {
      const clean = sectors.map((s) => ({ value: s.value || slug(s.label), label: s.label })).filter((s) => s.label);
      await base44.entities.Event.update(event.id, { bar_sectors: clean });
      setSectors(clean);
      toast({ title: 'Sectores guardados' });
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setSavingSectors(false);
  };

  const save = async (p) => {
    try {
      const clean = {
        ...p,
        event_id: event.id,
        event_name: event.name,
        company: event.company,
        price: Number(p.price),
        sector_prices: p.sector_prices || {},
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
      {/* Sectores / ubicaciones */}
      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-600"><UtensilsCrossed className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sectores / ubicaciones</h3>
              <p className="text-xs text-slate-500">Definí los sectores del evento (General, VIP…). En el POS de barra se elige con un selector y cambian los precios.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addSector} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-bold text-white hover:bg-slate-800"><Plus className="h-3 w-3" /> Sector</button>
            <button onClick={saveSectors} disabled={savingSectors} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Save className="h-3 w-3" /> Guardar sectores</button>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {sectors.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={s.label} onChange={(e) => updSector(i, 'label', e.target.value)} placeholder="Ej. VIP" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              <input value={s.value} onChange={(e) => updSector(i, 'value', slug(e.target.value))} placeholder="slug" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono text-slate-500" />
              <button onClick={() => delSector(i)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {sectors.length === 0 && <p className="text-xs text-slate-400">Sin sectores. El POS usará el precio base de cada producto.</p>}
        </div>
      </div>

      {/* Productos */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><UtensilsCrossed className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Menú del evento</h3>
            <p className="text-xs text-slate-500">Catálogo base. Todas las barras usan este menú; cada producto puede tener precio por sector.</p>
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
          {products.map((p) => {
            const spCount = p.sector_prices ? Object.keys(p.sector_prices).length : 0;
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">{p.name} {p.status === 'inactive' && <span className="text-xs text-slate-400">(inactivo)</span>}</p>
                  <p className="text-xs text-slate-500">{p.category ? `${p.category} · ` : ''}{fmtCur(p.price)}{spCount > 0 ? ` · ${spCount} sector(es)` : ''}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <EventProductEditorModal product={modal} sectors={sectors} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}