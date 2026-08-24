import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Download, Wine, TrendingUp, Receipt, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import PageHeader from '@/components/ui/page-header';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function BarrasReportes() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const evs = await base44.entities.Event.list('-start_at', 200); setEvents(evs); } catch {}
      setLoading(false);
    })();
  }, []);

  const load = async (id) => {
    if (!id) { setSales([]); return; }
    setLoading(true);
    try { setSales(await base44.entities.BarSale.filter({ event_id: id }, '-created_date', 1000)); } catch {}
    setLoading(false);
  };

  const paid = sales.filter((s) => s.status === 'paid');
  const totalRevenue = paid.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const ticketCount = paid.length;

  const productMap = {};
  for (const s of paid) for (const it of (s.items || [])) {
    if (!productMap[it.name]) productMap[it.name] = { name: it.name, qty: 0, revenue: 0 };
    productMap[it.name].qty += Number(it.qty || 0);
    productMap[it.name].revenue += Number(it.subtotal || 0);
  }
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const barMap = {};
  for (const s of paid) {
    const key = s.bar_name || s.bar_id;
    if (!barMap[key]) barMap[key] = { name: key, total: 0, count: 0 };
    barMap[key].total += Number(s.total || 0);
    barMap[key].count += 1;
  }
  const byBar = Object.values(barMap).sort((a, b) => b.total - a.total);

  const exportCsv = () => {
    const rows = [['Barra', 'Operador', 'Total', 'Items', 'Estado', 'Fecha']];
    for (const s of sales) rows.push([s.bar_name || '', s.operator_name || '', s.total, (s.items || []).length, s.status, new Date(s.created_date).toLocaleString()]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `barras-${eventId}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader kicker="Barras" title="Reportes de barras">
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); load(e.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="">Elegí un evento…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Wine className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-4 text-sm text-slate-500">Elegí un evento para ver los reportes.</p></div>
      ) : loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={TrendingUp} label="Total vendido" value={fmtCur(totalRevenue)} tone="emerald" />
            <StatCard icon={Receipt} label="Tickets cobrados" value={ticketCount} tone="slate" />
            <StatCard icon={Package} label="Productos distintos" value={Object.keys(productMap).length} tone="amber" />
          </div>

          {byBar.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-bold text-slate-900">Ventas por barra</h3>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byBar}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => fmtCur(v)} />
                    <Bar dataKey="total" fill="hsl(164 72% 24%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Top productos</h3>
              <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Exportar CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2 pr-3">Producto</th><th className="py-2 pr-3">Cantidad</th><th className="py-2 pr-3">Ingreso</th></tr></thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.name} className="border-t border-slate-100"><td className="py-2 pr-3 font-semibold text-slate-800">{p.name}</td><td className="py-2 pr-3 text-slate-600">{p.qty}</td><td className="py-2 pr-3 text-slate-600">{fmtCur(p.revenue)}</td></tr>
                  ))}
                  {topProducts.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400">Sin ventas registradas.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', slate: 'bg-slate-100 text-slate-700', amber: 'bg-amber-50 text-amber-700' };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><span className="text-sm font-semibold text-slate-500">{label}</span></div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}