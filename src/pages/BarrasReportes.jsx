import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wine, Download, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import BarStats from '@/components/barras/BarStatCard';
import BarDateFilter from '@/components/barras/BarDateFilter';
import BarCharts from '@/components/barras/BarCharts';
import BarTables from '@/components/barras/BarTables';
import { filterByRange, aggregateStats, byPaymentMethod, byBar as byBarAgg, hourlySales, topProducts, byOperator, byCategory, exportSalesXlsx } from '@/lib/barReports';

export default function BarrasReportes() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');
  const [method, setMethod] = useState('all');
  const [afipSyncing, setAfipSyncing] = useState(false);
  const [afipResult, setAfipResult] = useState(null);

  useEffect(() => {
    (async () => {
      try { const evs = await base44.entities.Event.list('-start_at', 200); setEvents(evs); } catch {}
      setLoading(false);
    })();
  }, []);

  const load = async (id) => {
    if (!id) { setSales([]); setProducts([]); return; }
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        base44.entities.BarSale.filter({ event_id: id }, '-created_date', 2000),
        base44.entities.EventProduct.filter({ event_id: id }, 'sort_order', 500),
      ]);
      setSales(s); setProducts(p);
    } catch {}
    setLoading(false);
  };

  const productCategoryMap = useMemo(() => {
    const m = {};
    for (const p of products) m[p.name] = p.category;
    return m;
  }, [products]);

  const paid = useMemo(() => {
    let r = sales.filter((s) => s.status === 'paid');
    r = filterByRange(r, range);
    if (method !== 'all') r = r.filter((s) => (s.payment_method || 'cash') === method);
    return r;
  }, [sales, range, method]);

  const stats = useMemo(() => aggregateStats(paid), [paid]);

  const afipCounts = useMemo(() => {
    const c = { issued: 0, pending: 0, error: 0, sandbox: 0, none: 0 };
    for (const s of paid) {
      const e = s.afip_estado || 'none';
      c[e] = (c[e] || 0) + 1;
    }
    return c;
  }, [paid]);

  const syncAfip = async () => {
    setAfipSyncing(true);
    setAfipResult(null);
    try {
      const res = await base44.functions.invoke('afipSyncPending', {});
      setAfipResult(res?.data ?? res);
      if (eventId) load(eventId);
    } catch (e) {
      setAfipResult({ error: e.message });
    } finally {
      setAfipSyncing(false);
    }
  };
  const data = useMemo(() => ({
    byBar: byBarAgg(paid),
    hourly: hourlySales(paid),
    byMethod: byPaymentMethod(paid),
    topProducts: topProducts(paid),
    byOperator: byOperator(paid),
    byCategory: byCategory(paid, productCategoryMap),
  }), [paid, productCategoryMap]);

  return (
    <div>
      <PageHeader kicker="Barras" title="Reportes de barras">
        <div className="flex flex-wrap items-center gap-2">
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); load(e.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <option value="">Elegí un evento…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {eventId && <button onClick={() => exportSalesXlsx(paid, eventId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Exportar Excel</button>}
        </div>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Wine className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-4 text-sm text-slate-500">Elegí un evento para ver los reportes.</p></div>
      ) : loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : paid.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Wine className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-4 text-sm text-slate-500">Sin ventas en el período seleccionado.</p></div>
      ) : (
        <div className="space-y-5">
          <BarDateFilter range={range} setRange={setRange} method={method} setMethod={setMethod} />
          <BarStats stats={stats} />
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">Facturación AFIP</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">CAE {afipCounts.issued}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Pend. {afipCounts.pending + afipCounts.none}</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Pruebas {afipCounts.sandbox}</span>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Error {afipCounts.error}</span>
            </div>
            <button onClick={syncAfip} disabled={afipSyncing} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {afipSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Facturar pendientes en AFIP
            </button>
            {afipResult && !afipResult.error && (
              <span className="text-xs font-semibold text-emerald-700">Procesadas: {afipResult.processed ?? 0} · Emitidas: {afipResult.issued ?? 0} · Errores: {afipResult.errors ?? 0}</span>
            )}
            {afipResult?.error && <span className="text-xs font-semibold text-red-600">{afipResult.error}</span>}
          </div>
          <BarCharts byBar={data.byBar} hourly={data.hourly} byMethod={data.byMethod} />
          <BarTables topProducts={data.topProducts} byOperator={data.byOperator} byCategory={data.byCategory} sales={paid} />
        </div>
      )}
    </div>
  );
}