import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wine, Download } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import BarStats from '@/components/barras/BarStatCard';
import BarDateFilter from '@/components/barras/BarDateFilter';
import BarCharts from '@/components/barras/BarCharts';
import BarTables from '@/components/barras/BarTables';
import { filterByRange, aggregateStats, byPaymentMethod, byBar as byBarAgg, hourlySales, topProducts, byOperator, byCategory, exportCsv } from '@/lib/barReports';

export default function BarrasReportes() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('all');
  const [method, setMethod] = useState('all');

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
          {eventId && <button onClick={() => exportCsv(paid, eventId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Exportar CSV</button>}
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
          <BarCharts byBar={data.byBar} hourly={data.hourly} byMethod={data.byMethod} />
          <BarTables topProducts={data.topProducts} byOperator={data.byOperator} byCategory={data.byCategory} sales={paid} />
        </div>
      )}
    </div>
  );
}