import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Pencil, Wine, UtensilsCrossed, ExternalLink, BarChart3 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/page-header';
import BarFormModal from '@/components/barras/BarFormModal';
import ProductEditorModal from '@/components/barras/ProductEditorModal';
import BarPosDevices from '@/components/barras/BarPosDevices';
import EventMenu from '@/components/barras/EventMenu';
import { Cpu, Download } from 'lucide-react';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function Barras() {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [barModal, setBarModal] = useState(null);
  const [productModal, setProductModal] = useState(null);
  const [productsByBar, setProductsByBar] = useState({});
  const [expandedBar, setExpandedBar] = useState(null);
  const [posBar, setPosBar] = useState(null);

  useEffect(() => {
    (async () => {
      try { const evs = await base44.entities.Event.list('-start_at', 200); setEvents(evs); } catch {}
      setLoading(false);
    })();
  }, []);

  const loadBars = useCallback(async (id) => {
    if (!id) { setBars([]); return; }
    setLoading(true);
    try { const b = await base44.entities.Bar.filter({ event_id: id }, 'name', 100); setBars(b); }
    catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setLoading(false);
  }, [toast]);

  const loadProducts = async (barId) => {
    try { const ps = await base44.entities.BarProduct.filter({ bar_id: barId }, 'sort_order', 200); setProductsByBar((p) => ({ ...p, [barId]: ps })); }
    catch {}
  };

  const toggleBar = (barId) => {
    const next = expandedBar === barId ? null : barId;
    setExpandedBar(next);
    if (next) loadProducts(barId);
  };

  const saveBar = async (b) => {
    try {
      const ev = events.find((e) => e.id === (b.event_id || eventId));
      const clean = { ...b, event_id: b.event_id || eventId, event_name: ev?.name, company: ev?.company };
      let created;
      if (b.id) await base44.entities.Bar.update(b.id, clean);
      else created = await base44.entities.Bar.create(clean);
      setBarModal(null);
      // Al crear una barra nueva, copia el catálogo del evento como menú base.
      if (created) await seedFromEvent(created);
      await loadBars(eventId);
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  // Copia los productos del catálogo del evento a la barra (sólo los que no
  // existan ya por nombre, para no pisar precios ajustados en reimportaciones).
  const seedFromEvent = async (bar) => {
    try {
      const catalog = await base44.entities.EventProduct.filter({ event_id: bar.event_id, status: 'active' }, 'sort_order', 300);
      if (!catalog.length) return 0;
      const existing = await base44.entities.BarProduct.filter({ bar_id: bar.id }, 'sort_order', 300);
      const names = new Set(existing.map((p) => p.name));
      const toCreate = catalog
        .filter((c) => !names.has(c.name))
        .map((c) => ({
          bar_id: bar.id, bar_name: bar.name,
          event_id: bar.event_id, event_name: bar.event_name, company: bar.company,
          name: c.name, category: c.category, price: Number(c.price), sort_order: Number(c.sort_order || 0), status: 'active',
        }));
      if (toCreate.length) await base44.entities.BarProduct.bulkCreate(toCreate);
      return toCreate.length;
    } catch { return 0; }
  };

  const importMenu = async (b) => {
    const n = await seedFromEvent(b);
    await loadProducts(b.id);
    toast({ title: n ? 'Menú importado' : 'Sin cambios', description: n ? `Se agregaron ${n} producto(s) del evento (sin pisar los ya ajustados).` : 'La barra ya tiene todos los productos del catálogo.' });
  };

  const deleteBar = async (b) => {
    if (!confirm(`¿Eliminar la barra "${b.name}"?`)) return;
    try { await base44.entities.Bar.delete(b.id); await loadBars(eventId); } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const saveProduct = async (p) => {
    try {
      const bar = bars.find((b) => b.id === (p.bar_id || productModal?.barId));
      const barId = p.bar_id || productModal?.barId;
      const clean = { ...p, bar_id: barId, bar_name: bar?.name, event_id: bar?.event_id, event_name: bar?.event_name, company: bar?.company, price: Number(p.price), sort_order: Number(p.sort_order || 0) };
      if (p.id) await base44.entities.BarProduct.update(p.id, clean);
      else await base44.entities.BarProduct.create(clean);
      setProductModal(null);
      await loadProducts(barId);
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const deleteProduct = async (p) => {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    try { await base44.entities.BarProduct.delete(p.id); await loadProducts(p.bar_id); } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div>
      <PageHeader kicker="Barras" title="Barras de bebida y comida">
        <div className="flex flex-wrap items-center gap-2">
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); loadBars(e.target.value); setExpandedBar(null); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <option value="">Elegí un evento…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {eventId && (
            <>
              <button onClick={() => setBarModal({ event_id: eventId, name: '', location: '', status: 'active' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Nueva barra
              </button>
              <Link to="/barras-reportes" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <BarChart3 className="h-4 w-4" /> Reportes
              </Link>
            </>
          )}
        </div>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Wine className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Elegí un evento para configurar sus barras y menús.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="space-y-4">
          <EventMenu event={events.find((e) => e.id === eventId)} />
          {bars.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Sin barras. Creá la primera.</div>}
          {bars.map((b) => (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Wine className="h-5 w-5" /></span>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{b.name} {b.status === 'inactive' && <span className="ml-1 text-xs text-slate-400">(inactiva)</span>}</p>
                  <p className="text-xs text-slate-500">{b.location || 'Sin ubicación'}</p>
                </div>
                <Link to={`/barras/${b.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                  <ExternalLink className="h-4 w-4" /> Abrir POS
                </Link>
                <button onClick={() => toggleBar(b.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <UtensilsCrossed className="h-4 w-4" /> Menú
                </button>
                <button onClick={() => importMenu(b)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Importar menú
                </button>
                <button onClick={() => setPosBar(posBar === b.id ? null : b.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${posBar === b.id ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <Cpu className="h-4 w-4" /> POS
                </button>
                <button onClick={() => setBarModal(b)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => deleteBar(b)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
              {expandedBar === b.id && (
                <div className="border-t border-slate-100 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700">Productos</h4>
                    <button onClick={() => setProductModal({ barId: b.id, name: '', category: '', price: 0, sort_order: (productsByBar[b.id]?.length || 0), status: 'active' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                      <Plus className="h-4 w-4" /> Agregar producto
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(productsByBar[b.id] || []).map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                        <div>
                          <p className="text-sm font-bold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.category ? `${p.category} · ` : ''}{fmtCur(p.price)}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setProductModal(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => deleteProduct(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    {(!productsByBar[b.id] || productsByBar[b.id].length === 0) && <p className="text-sm text-slate-400">Sin productos.</p>}
                  </div>
                </div>
              )}
              {posBar === b.id && (
                <div className="border-t border-slate-100 p-4">
                  <BarPosDevices bar={b} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {barModal && <BarFormModal bar={barModal} onClose={() => setBarModal(null)} onSave={saveBar} />}
      {productModal && <ProductEditorModal product={productModal} onClose={() => setProductModal(null)} onSave={saveProduct} />}
    </div>
  );
}