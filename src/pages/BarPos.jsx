import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Plus, Minus, Trash2, CheckCircle2, XCircle, ArrowLeft, Wine, Banknote, CreditCard, QrCode, Printer, X, Cpu, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getAgentPrinters, checkAgent } from '@/lib/printAgent';
import BarReceipt from '@/components/barras/BarReceipt';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const LS_PRINTER_KEY = 'ae_bar_printer';

// Mapeo del estado del intent de Point a etiqueta visible.
const STATE_LABELS = {
  open: 'Esperando terminal…',
  ready: 'Esperando tarjeta…',
  process_init: 'Iniciando pago…',
  process_processing: 'Procesando pago…',
  process_authorized: 'Pago aprobado',
  process_denied: 'Pago rechazado',
  canceled: 'Operación cancelada',
  finished: 'Pago aprobado',
  demo: 'Modo demo · confirmá manualmente',
};
const isApproved = (s) => s === 'finished' || s === 'process_authorized';
const isRejected = (s) => s === 'process_denied' || s === 'canceled';

export default function BarPos() {
  const { barId } = useParams();
  const [bar, setBar] = useState(null);
  const [products, setProducts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [event, setEvent] = useState(null);
  const [sector, setSector] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [category, setCategory] = useState('all');
  const [payModal, setPayModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [qrView, setQrView] = useState(null);
  const [devicePicker, setDevicePicker] = useState(null); // { sale_id, total, sale_items, opName }
  const [cardView, setCardView] = useState(null); // { sale_id, total, sale_items, opName, device_alias?, state, result, demo? }
  const [confirming, setConfirming] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState(localStorage.getItem(LS_PRINTER_KEY) || '');
  const receiptRef = useRef(null);
  const pollRef = useRef(null);
  const cardPollStart = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const b = await base44.entities.Bar.get(barId);
        setBar(b);
        const [ev, ps, devs] = await Promise.all([
          base44.entities.Event.get(b.event_id).catch(() => null),
          base44.entities.EventProduct.filter({ event_id: b.event_id, status: 'active' }, 'sort_order', 300),
          base44.entities.BarPosDevice.filter({ bar_id: barId, status: 'active' }, 'alias', 50),
        ]);
        setEvent(ev);
        setProducts(ps);
        setDevices(devs);
        if (ev?.bar_sectors?.length) setSector(ev.bar_sectors[0].value);
      } catch {}
      setLoading(false);
      try {
        const health = await checkAgent();
        if (health) setPrinters(await getAgentPrinters() || []);
      } catch {}
    })();
  }, [barId]);

  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const visible = category === 'all' ? products : products.filter((p) => p.category === category);

  const effPrice = (p) => {
    const sp = p.sector_prices;
    if (sp && sector && sp[sector] != null && sp[sector] !== '') return Number(sp[sector]);
    return Number(p.price);
  };
  const add = (p) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty || 0) + 1, unit_price: effPrice(p) } }));
  const dec = (id) => setCart((c) => { const n = { ...c }; if (n[id]) { n[id] = { ...n[id], qty: n[id].qty - 1 }; if (n[id].qty <= 0) delete n[id]; } return n; });
  const removeItem = (id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });
  const clear = () => setCart({});

  const items = Object.values(cart);
  const total = items.reduce((s, it) => s + (it.unit_price ?? it.product.price) * it.qty, 0);

  const savePrinter = (name) => { setPrinterName(name); localStorage.setItem(LS_PRINTER_KEY, name); };

  const doCheckout = async (method) => {
    if (items.length === 0 || processing) return;
    setPayModal(false);
    setProcessing(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const opName = me?.full_name || me?.email || 'Operador';
      const saleItems = items.map((it) => ({ name: it.product.name, price: it.unit_price ?? it.product.price, qty: it.qty, subtotal: (it.unit_price ?? it.product.price) * it.qty }));

      const res = await base44.functions.invoke('barSale', {
        action: 'create',
        bar_id: barId,
        items: saleItems,
        payment_method: method,
        operator_name: opName,
      });
      const data = res.data || res;

      if (method === 'qr' && data.status === 'pending' && data.init_point) {
        setProcessing(false);
        setQrView({ sale_id: data.sale_id, init_point: data.init_point, total: data.total, sale_items: saleItems, operator_name: opName });
        startQrPolling(data.sale_id, saleItems, opName, data.total);
        return;
      }

      if (method === 'card' && data.status === 'pending') {
        setProcessing(false);
        // Modo demo (sin MP configurado): no hay terminal real, sólo respaldo manual.
        if (data.demo) {
          setCardView({ sale_id: data.sale_id, total: data.total, sale_items: saleItems, operator_name: opName, state: 'demo', result: 'pending', demo: true });
          return;
        }
        // Sin terminales cargadas: no se puede cobrar con tarjeta.
        if (devices.length === 0) {
          await base44.functions.invoke('barSale', { action: 'confirm', sale_id: data.sale_id }).catch(() => {});
          // cancelamos la venta pending para no dejarla colgada
          try {
            const s = await base44.entities.BarSale.get(data.sale_id);
            if (s && s.status === 'pending') await base44.entities.BarSale.update(data.sale_id, { status: 'cancelled' });
          } catch {}
          alert('No hay terminal Mercado Pago Point asignada a esta barra. Cargala desde Barras > POS.');
          return;
        }
        // Una sola terminal: dispara el intent directo.
        if (devices.length === 1) {
          await createCardIntent(data.sale_id, devices[0], saleItems, opName, data.total);
          return;
        }
        // Varias terminales: el operador elige.
        setDevicePicker({ sale_id: data.sale_id, total: data.total, sale_items: saleItems, operator_name: opName });
        return;
      }

      // Efectivo o demo confirmado: venta pagada → imprimir + confirmar.
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

  const createCardIntent = async (saleId, device, saleItems, opName, saleTotal) => {
    setDevicePicker(null);
    setProcessing(true);
    try {
      const res = await base44.functions.invoke('barSale', { action: 'create_card_intent', sale_id: saleId, device_id: device.id });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      cardPollStart.current = Date.now();
      setCardView({
        sale_id: saleId,
        total: saleTotal,
        sale_items: saleItems,
        operator_name: opName,
        device_alias: data.device_alias || device.alias,
        state: data.state || 'open',
        result: 'pending',
      });
      startCardPolling(saleId, saleItems, opName, saleTotal);
    } catch (e) {
      alert('No se pudo iniciar el cobro en la terminal: ' + (e.message || 'error'));
      // cancela la venta pending para no dejarla colgada
      try { await base44.entities.BarSale.update(saleId, { status: 'cancelled' }); } catch {}
    }
    setProcessing(false);
  };

  const startCardPolling = (saleId, saleItems, opName, saleTotal) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await base44.functions.invoke('barSale', { action: 'poll_intent', sale_id: saleId });
        const data = res.data || res;
        setCardView((cv) => cv && cv.sale_id === saleId ? { ...cv, state: data.state, result: data.result } : cv);
        if (data.result === 'approved') {
          clearInterval(pollRef.current); pollRef.current = null;
          finishCardSale(saleId, saleItems, opName, saleTotal);
        } else if (data.result === 'rejected') {
          clearInterval(pollRef.current); pollRef.current = null;
          // dejamos cardView mostrando rechazado; el operador decide reintentar o cancelar.
        } else if (attempts > 40) {
          // ~120s sin resolución: dejamos de pollear y destacamos el botón de respaldo.
          clearInterval(pollRef.current); pollRef.current = null;
          setCardView((cv) => cv && cv.sale_id === saleId ? { ...cv, result: 'timeout' } : cv);
        }
      } catch {}
    }, 3000);
  };

  const startQrPolling = (saleId, saleItems, opName, saleTotal) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await base44.functions.invoke('barSale', { action: 'status', sale_id: saleId });
        const st = (res.data || res).status;
        if (st === 'paid') {
          clearInterval(pollRef.current); pollRef.current = null;
          setQrView(null);
          setLastSale({ id: saleId, items: saleItems, total: saleTotal, payment_method: 'qr', operator_name: opName, created_at: new Date().toISOString() });
          setConfirming({ total: saleTotal, method: 'qr' });
          setCart({});
        } else if (st === 'cancelled' || attempts > 120) {
          clearInterval(pollRef.current); pollRef.current = null;
          setQrView(null);
          alert('El pago no se confirmó. Reintentá el cobro.');
        }
      } catch {}
    }, 3000);
  };

  const finishCardSale = (saleId, saleItems, opName, saleTotal) => {
    setCardView(null);
    setLastSale({ id: saleId, items: saleItems, total: saleTotal, payment_method: 'card', operator_name: opName, created_at: new Date().toISOString() });
    setConfirming({ total: saleTotal, method: 'card' });
    setCart({});
  };

  const manualConfirmQr = async () => {
    if (!qrView) return;
    try {
      await base44.functions.invoke('barSale', { action: 'confirm', sale_id: qrView.sale_id });
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      const qv = qrView;
      setQrView(null);
      setLastSale({ id: qv.sale_id, items: qv.sale_items, total: qv.total, payment_method: 'qr', operator_name: qv.operator_name || 'Operador', created_at: new Date().toISOString() });
      setConfirming({ total: qv.total, method: 'qr' });
      setCart({});
    } catch (e) { alert('Error: ' + e.message); }
  };

  const cancelQr = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } setQrView(null); };

  // Confirmar pago con tarjeta: respaldo manual cuando la terminal no responde
  // o el operador ya cobró en el posnet y MP no notificó.
  const manualConfirmCard = async () => {
    if (!cardView) return;
    try {
      await base44.functions.invoke('barSale', { action: 'confirm', sale_id: cardView.sale_id });
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      const cv = cardView;
      setCardView(null);
      setLastSale({ id: cv.sale_id, items: cv.sale_items, total: cv.total, payment_method: 'card', operator_name: cv.operator_name || 'Operador', created_at: new Date().toISOString() });
      setConfirming({ total: cv.total, method: 'card' });
      setCart({});
    } catch (e) { alert('Error: ' + e.message); }
  };

  // Reintentar cobro tras rechazo: crea un nuevo intent en la misma terminal.
  const retryCard = async () => {
    if (!cardView) return;
    const cv = cardView;
    // limpia el intent previo: la venta sigue pending, le enganchamos un nuevo intent.
    setCardView({ ...cv, state: 'open', result: 'pending' });
    const device = devices.find((d) => d.alias === cv.device_alias) || devices[0];
    if (!device) { alert('No hay terminal disponible.'); return; }
    try {
      const res = await base44.functions.invoke('barSale', { action: 'create_card_intent', sale_id: cv.sale_id, device_id: device.id });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      cardPollStart.current = Date.now();
      setCardView({ ...cv, state: data.state || 'open', result: 'pending' });
      startCardPolling(cv.sale_id, cv.sale_items, cv.operator_name, cv.total);
    } catch (e) { alert('No se pudo reintentar: ' + (e.message || 'error')); }
  };

  const cancelCard = async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (cardView) {
      try {
        const s = await base44.entities.BarSale.get(cardView.sale_id);
        if (s && s.status === 'pending') await base44.entities.BarSale.update(cardView.sale_id, { status: 'cancelled' });
      } catch {}
    }
    setCardView(null);
  };

  useEffect(() => {
    if (confirming) {
      const t = setTimeout(() => setConfirming(null), 2500);
      return () => clearTimeout(t);
    }
  }, [confirming]);

  // Dispara la impresión cuando lastSale se actualiza.
  useEffect(() => {
    if (!lastSale || !receiptRef.current) return;
    if (lastSale.payment_method === 'card') {
      receiptRef.current.printComanda(printerName).catch(() => {});
    } else {
      receiptRef.current.printBoth(printerName).catch(() => {});
    }
  }, [lastSale, printerName]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>;
  if (!bar) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-sm text-slate-500">Barra no encontrada. <Link to="/barras" className="font-bold text-emerald-700">Volver</Link></p></div>;

  const cardAvailable = devices.length > 0;

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
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${cardAvailable ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            <Cpu className="h-3 w-3" /> {cardAvailable ? `${devices.length} POS` : 'Sin POS'}
          </span>
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
          {event?.bar_sectors?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-5 py-2">
              {event.bar_sectors.map((s) => (
                <button key={s.value} onClick={() => setSector(s.value)} className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-extrabold transition ${sector === s.value ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
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
                    <span className="mt-2 text-xl font-extrabold text-emerald-700">{fmtCur(effPrice(p))}</span>
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
                      <p className="text-xs text-slate-400">{fmtCur(it.unit_price ?? it.product.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => dec(it.product.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                      <span className="w-7 text-center text-sm font-bold text-slate-900">{it.qty}</span>
                      <button onClick={() => add(it.product)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                      <button onClick={() => removeItem(it.product.id)} className="ml-1 grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <span className="w-16 text-right text-sm font-bold text-slate-900">{fmtCur((it.unit_price ?? it.product.price) * it.qty)}</span>
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
                  <p className="text-sm text-slate-500">{cardAvailable ? `Terminal Point (${devices.length})` : 'Sin terminal asignada'}</p>
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

      {/* Picker de terminal Point cuando hay varias */}
      {devicePicker && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Elegí la terminal</h3>
                <p className="text-sm text-slate-500">Cobrar {fmtCur(devicePicker.total)}</p>
              </div>
              <button onClick={() => cancelCard()} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-2">
              {devices.map((d) => (
                <button key={d.id} onClick={() => createCardIntent(devicePicker.sale_id, d, devicePicker.sale_items, devicePicker.operator_name, devicePicker.total)}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-600"><Cpu className="h-5 w-5" /></span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{d.alias}</p>
                    <p className="text-xs font-mono text-slate-500">{d.device_id}</p>
                  </div>
                  <CreditCard className="h-5 w-5 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Overlay de espera para pago con tarjeta (posnet Point) */}
      {cardView && (
        <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-slate-900 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${isApproved(cardView.state) ? 'bg-emerald-100' : isRejected(cardView.state) ? 'bg-red-100' : 'bg-amber-100'}`}>
              {isApproved(cardView.state) ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : isRejected(cardView.state) ? <XCircle className="h-8 w-8 text-red-600" /> : <CreditCard className="h-8 w-8 text-amber-600" />}
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-slate-900">Cobrá {fmtCur(cardView.total)}</h3>
            {cardView.device_alias && <p className="mt-1 text-sm text-slate-500">Terminal: <b className="text-slate-700">{cardView.device_alias}</b></p>}
            <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">{STATE_LABELS[cardView.state] || 'Procesando…'}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">state: {cardView.state || '—'}</p>
            </div>
            {!isApproved(cardView.state) && !isRejected(cardView.state) && cardView.result !== 'timeout' && !cardView.demo && (
              <div className="mt-4 flex items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Esperando respuesta de la terminal…</span>
              </div>
            )}
            {cardView.result === 'timeout' && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-semibold">La terminal no responde. Usá el respaldo manual.</span>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {isRejected(cardView.state) ? (
                <>
                  <button onClick={retryCard} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700">Reintentar</button>
                  <button onClick={cancelCard} className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
                </>
              ) : isApproved(cardView.state) ? null : (
                <>
                  <button onClick={manualConfirmCard} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                    Pago aprobado (respaldo)
                  </button>
                  <button onClick={cancelCard} className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
                </>
              )}
            </div>
            {cardView.demo && <p className="mt-4 text-xs text-slate-400">Modo demo · sin terminal real · confirmá manualmente para registrar la venta.</p>}
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
              <button onClick={manualConfirmQr} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700">
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

      <BarReceipt ref={receiptRef} sale={lastSale} bar={bar} event={{ name: bar.event_name }} />
    </div>
  );
}