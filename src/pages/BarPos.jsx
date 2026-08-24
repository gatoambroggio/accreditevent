import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Plus, Minus, Trash2, CheckCircle2, ArrowLeft, Wine } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function BarPos() {
  const { barId } = useParams();
  const [bar, setBar] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [category, setCategory] = useState('all');
  const [confirming, setConfirming] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const b = await base44.entities.Bar.get(barId);
        setBar(b);
        const ps = await base44.entities.BarProduct.filter({ bar_id: barId, status: 'active' }, 'sort_order', 200);
        setProducts(ps);
      } catch {}
      setLoading(false);
    })();
  }, [barId]);

  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const visible = category === 'all' ? products : products.filter((p) => p.category === category);

  const add = (p) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty || 0) + 1 } }));
  const dec = (id) => setCart((c) => { const n = { ...c }; if (n[id]) { n[id] = { ...n[id], qty: n[id].qty - 1 }; if (n[id].qty <= 0) delete n[id]; } return n; });
  const removeItem = (id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });
  const clear = () => setCart({});

  const items = Object.values(cart);
  const total = items.reduce((s, it) => s + it.product.price * it.qty, 0);

  const checkout = async () => {
    if (items.length === 0 || processing) return;
    setProcessing(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const opName = me?.full_name || me?.email || 'Operador';
      const saleItems = items.map((it) => ({ name: it.product.name, price: it.product.price, qty: it.qty, subtotal: it.product.price * it.qty }));
      await base44.entities.BarSale.create({
        bar_id: barId,
        bar_name: bar.name,
        event_id: bar.event_id,
        event_name: bar.event_name,
        company: bar.company,
        operator_name: opName,
        items: saleItems,
        total,
        status: 'paid',
      });
      setConfirming({ total });
      setCart({});
    } catch (e) { alert('Error: ' + e.message); }
    setProcessing(false);
  };

  useEffect(() => {
    if (confirming) {
      const t = setTimeout(() => setConfirming(null), 2200);
      return () => clearTimeout(t);
    }
  }, [confirming]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!bar) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-sm text-slate-500">Barra no encontrada. <Link to="/barras" className="font-bold text-emerald-700">Volver</Link></p></div>;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link to="/barras" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white"><Wine className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{bar.name}</h1>
            <p className="text-xs text-slate-500">{bar.event_name}{bar.location ? ` · ${bar.location}` : ''}</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">MODO DEMO</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {categories.length > 2 && (
            <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-5 py-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold ${category === c ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {c === 'all' ? 'Todos' : c}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-5">
            {products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Esta barra no tiene productos. Cargá el menú desde el panel de administración.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((p) => (
                  <button key={p.id} onClick={() => add(p)} className="flex min-h-[96px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98]">
                    <span className="text-sm font-bold leading-tight text-slate-900">{p.name}</span>
                    <span className="mt-2 text-xl font-extrabold text-emerald-700">{fmtCur(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="flex w-80 flex-col border-l border-slate-200 bg-white sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Ticket actual</h2>
            {items.length > 0 && <button onClick={clear} className="text-xs font-semibold text-red-500 hover:text-red-700">Limpiar</button>}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-slate-400">Tocá un producto para agregarlo.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.product.id} className="flex items-center gap-2 rounded-xl border border-slate-100 px-2 py-2">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{it.product.name}</p>
                      <p className="text-xs text-slate-400">{fmtCur(it.product.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => dec(it.product.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                      <span className="w-7 text-center text-sm font-bold text-slate-900">{it.qty}</span>
                      <button onClick={() => add(it.product)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                      <button onClick={() => removeItem(it.product.id)} className="ml-1 grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <span className="w-16 text-right text-sm font-bold text-slate-900">{fmtCur(it.product.price * it.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Total</span>
              <span className="text-3xl font-extrabold text-slate-900">{fmtCur(total)}</span>
            </div>
            <button onClick={checkout} disabled={items.length === 0 || processing} className="w-full rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40">
              {processing ? 'Cobrando…' : 'COBRAR'}
            </button>
          </div>
        </aside>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-emerald-600" onClick={() => setConfirming(null)}>
          <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} />
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white">COBRADO</p>
          <p className="mt-4 text-6xl font-extrabold text-white">{fmtCur(confirming.total)}</p>
          <p className="mt-4 text-sm text-white/70">Demo · venta registrada</p>
        </div>
      )}
    </div>
  );
}