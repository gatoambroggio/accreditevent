import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Plus, Minus, Trash2, CheckCircle2, ArrowLeft, Wine, Banknote, CreditCard, QrCode, Printer, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getAgentPrinters, checkAgent } from '@/lib/printAgent';
import BarReceipt from '@/components/barras/BarReceipt';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const LS_PRINTER_KEY = 'ae_bar_printer';

export default function BarPos() {
  const { barId } = useParams();
  const [bar, setBar] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [category, setCategory] = useState('all');
  const [payModal, setPayModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [qrView, setQrView] = useState(null); // { sale_id, init_point, total, sale_items }
  const [confirming, setConfirming] = useState(null); // { total, method }
  const [lastSale, setLastSale] = useState(null); // datos completos para imprimir
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState(localStorage.getItem(LS_PRINTER_KEY) || '');
  const receiptRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const b = await base44.entities.Bar.get(barId);
        setBar(b);
        const ps = await base44.entities.BarProduct.filter({ bar_id: barId, status: 'active' }, 'sort_order', 200);
        setProducts(ps);
      } catch {}
      setLoading(false);
      // Detectar impresoras del agente local
      try {
        const health = await checkAgent();
        if (health) {
          const ps = await getAgentPrinters();
          setPrinters(ps || []);
        }
      } catch {}
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

  const savePrinter = (name) => {
    setPrinterName(name);
    localStorage.setItem(LS_PRINTER_KEY, name);
  };

  const doCheckout = async (method) => {
    if (items.length === 0 || processing) return;
    setPayModal(false);
    setProcessing(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const opName = me?.full_name || me?.email || 'Operador';
      const saleItems = items.map((it) => ({ name: it.product.name, price: it.product.price, qty: it.qty, subtotal: it.product.price * it.qty }));

      const res = await base44.functions.invoke('barSale', {
        action: 'create',
        bar_id: barId,
        items: saleItems,
        payment_method: method,
        operator_name: opName,
      });
      const data = res.data || res;

      // QR con MP real: mostrar QR y esperar confirmación del webhook.
      if (method === 'qr' && data.status === 'pending' && data.init_point) {
        setProcessing(false);
        setQrView({ sale_id: data.sale_id, init_point: data.init_point, total: data.total, sale_items: saleItems, operator_name: opName });
        startPolling(data.sale_id, saleItems, method, opName, data.total);
        return;
      }

      // Efectivo, Tarjeta o demo: venta confirmada → imprimir + mostrar.
      setLastSale({
        id: data.sale_id,
        items: saleItems,
        total: data.total,
        payment_method: data.demo ? 'demo' : method,
        operator_name: opName,
        created_at: new Date().toISOString(),
      });
      setConfirming({ total: data.total, method: data.demo ? 'demo' : method });
      setCart({});
    } catch (e) {
      alert('Error: ' + (e.message || 'No se pudo procesar la venta'));
    }
    setProcessing(false);
  };

  const startPolling = (saleId, saleItems, method, opName, saleTotal) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    const qvTotal = saleTotal;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await base44.functions.invoke('barSale', { action: 'status', sale_id: saleId });
        const st = (res.data || res).status;
        if (st === 'paid') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setQrView(null);
          setLastSale({
            id: saleId,
            items: saleItems,
            total: qvTotal,
            payment_method: method,
            operator_name: opName,
            created_at: new Date().toISOString(),
          });
          setConfirming({ total: qvTotal, method });
          setCart({});
        } else if (st === 'cancelled' || attempts > 120) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setQrView(null);
          alert('El pago no se confirmó. Reintentá el cobro.');
        }
      } catch {}
    }, 3000);
  };

  const manualConfirm = async () => {
    if (!qrView) return;
    try {
      await base44.functions.invoke('barSale', { action: 'confirm', sale_id: qrView.sale_id });
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      const qv = qrView;
      setQrView(null);
      setLastSale({
        id: qv.sale_id,
        items: qv.sale_items,
        total: qv.total,
        payment_method: 'qr',
        operator_name: qv.operator_name || 'Operador',
        created_at: new Date().toISOString(),
      });
      setConfirming({ total: qv.total, method: 'qr' });
      setCart({});
    } catch (e) { alert('Error: ' + e.message); }
  };

  const cancelQr = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setQrView(null);
  };

  useEffect(() => {
    if (confirming) {
      const t = setTimeout(() => setConfirming(null), 2500);
      return () => clearTimeout(t);
    }
  }, [confirming]);

  // Dispara la impresión cuando lastSale se actualiza (el DOM ya tiene los divs).
  useEffect(() => {
    if (!lastSale) return;
    if (receiptRef.current) {
      receiptRef.current.printBoth(printerName).catch(() => {});
    }
  }, [lastSale, printerName]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
        <div className="flex items-center gap-2">
          {printers.length > 0 ? (
            <select value={printerName} onChange={(e) => savePrinter(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600">
              <option value="">Sin impresora</option>
              {printers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-700">
              <Printer className="h-3 w-3" /> Agente no detectado
            </span>
          )}
        </div>
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
            <button onClick={() => setPayModal(true)} disabled={items.length === 0 || processing} className="w-full rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40">
              {processing ? 'Procesando…' : 'COBRAR'}
            </button>
          </div>
        </aside>
      </div>

      {/* Modal de selección de método de pago */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setPayModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-slate-900">Cobrar {fmtCur(total)}</h3>
              <button onClick={() => setPayModal(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3">
              <button onClick={() => doCheckout('cash')} disabled={processing} className="flex items-center gap-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-left transition hover:border-emerald-500 hover:bg-emerald-100 disabled:opacity-50">
                <Banknote className="h-10 w-10 text-emerald-600" />
                <div>
                  <p className="text-lg font-extrabold text-slate-900">Efectivo</p>
                  <p className="text-sm text-slate-500">Confirmá el pago recibido</p>
                </div>
              </button>
              <button onClick={() => doCheckout('card')} disabled={processing} className="flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-400 hover:bg-slate-100 disabled:opacity-50">
                <CreditCard className="h-10 w-10 text-slate-600" />
                <div>
                  <p className="text-lg font-extrabold text-slate-900">Tarjeta</p>
                  <p className="text-sm text-slate-500">Terminal física / POS</p>
                </div>
              </button>
              <button onClick={() => doCheckout('qr')} disabled={processing} className="flex items-center gap-4 rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 text-left transition hover:border-blue-500 hover:bg-blue-100 disabled:opacity-50">
                <QrCode className="h-10 w-10 text-blue-600" />
                <div>
                  <p className="text-lg font-extrabold text-slate-900">QR Mercado Pago</p>
                  <p className="text-sm text-slate-500">El cliente escanea y paga</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de QR Mercado Pago */}
      {qrView && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-slate-900 p-6">
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <h3 className="text-xl font-extrabold text-slate-900">Escaneá para pagar</h3>
            <p className="mt-1 text-sm text-slate-500">Total: {fmtCur(qrView.total)}</p>
            <div className="my-6 flex justify-center">
              <QRCodeSVG value={qrView.init_point} size={240} level="M" />
            </div>
            <p className="text-xs text-slate-400">Esperando confirmación de pago…</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Consultando…</span>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={manualConfirm} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                Confirmar pago manual
              </button>
              <button onClick={cancelQr} className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de confirmación */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-emerald-600" onClick={() => setConfirming(null)}>
          <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} />
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white">COBRADO</p>
          <p className="mt-4 text-6xl font-extrabold text-white">{fmtCur(confirming.total)}</p>
          {confirming.method === 'demo' && <p className="mt-4 text-sm text-white/70">Modo demo · venta registrada</p>}
          {confirming.method === 'cash' && <p className="mt-4 text-sm text-white/70">Efectivo · comanda impresa</p>}
          {confirming.method === 'card' && <p className="mt-4 text-sm text-white/70">Tarjeta · comanda impresa</p>}
          {confirming.method === 'qr' && <p className="mt-4 text-sm text-white/70">QR Mercado Pago · comanda impresa</p>}
        </div>
      )}

      {/* Componente de impresión oculto */}
      <BarReceipt ref={receiptRef} sale={lastSale} bar={bar} event={{ name: bar.event_name }} />
    </div>
  );
}