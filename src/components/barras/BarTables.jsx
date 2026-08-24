import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { fmtCur, PAY_LABELS, PAY_COLORS } from '@/lib/barReports';

function Section({ title, children, right }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function PctBar({ pct, color }) {
  return <div className="h-2 w-full rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>;
}

export default function BarTables({ topProducts, byOperator, byCategory, sales }) {
  const [q, setQ] = useState('');
  const filtered = sales.filter((s) => `${s.bar_name || ''} ${s.operator_name || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <Section title="Top productos">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Producto</th><th className="py-2 pr-3">Cantidad</th><th className="py-2 pr-3">Ingreso</th><th className="py-2 pr-3 w-1/4">% del total</th></tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{p.name}</td>
                  <td className="py-2 pr-3 text-slate-600">{p.qty}</td>
                  <td className="py-2 pr-3 text-slate-600">{fmtCur(p.revenue)}</td>
                  <td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="flex-1"><PctBar pct={p.pct} color="hsl(164 72% 24%)" /></div><span className="w-10 text-right text-xs text-slate-500">{p.pct.toFixed(1)}%</span></div></td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sin ventas.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Ventas por operador">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2 pr-3">Operador</th><th className="py-2 pr-3">Tickets</th><th className="py-2 pr-3">Total</th></tr></thead>
            <tbody>
              {byOperator.map((o) => (
                <tr key={o.name} className="border-t border-slate-100"><td className="py-2 pr-3 font-semibold text-slate-800">{o.name}</td><td className="py-2 pr-3 text-slate-600">{o.count}</td><td className="py-2 pr-3 text-slate-600">{fmtCur(o.total)}</td></tr>
              ))}
              {byOperator.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400">Sin datos.</td></tr>}
            </tbody>
          </table>
        </Section>

        <Section title="Ventas por categoría">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2 pr-3">Categoría</th><th className="py-2 pr-3">Unidades</th><th className="py-2 pr-3">Ingreso</th></tr></thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.name} className="border-t border-slate-100"><td className="py-2 pr-3 font-semibold text-slate-800">{c.name}</td><td className="py-2 pr-3 text-slate-600">{c.qty}</td><td className="py-2 pr-3 text-slate-600">{fmtCur(c.revenue)}</td></tr>
              ))}
              {byCategory.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400">Sin datos.</td></tr>}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Detalle de ventas" right={
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar barra u operador…" className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm" />
        </div>
      }>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Barra</th><th className="py-2 pr-3">Operador</th><th className="py-2 pr-3">Pago</th><th className="py-2 pr-3">Unidades</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3">Estado</th></tr></thead>
            <tbody>
              {filtered.map((s) => {
                const d = new Date(s.created_date);
                const units = (s.items || []).reduce((u, it) => u + Number(it.qty || 0), 0);
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 text-slate-500">{d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2 pr-3 font-semibold text-slate-800">{s.bar_name || '-'}</td>
                    <td className="py-2 pr-3 text-slate-600">{s.operator_name || '-'}</td>
                    <td className="py-2 pr-3"><span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: PAY_COLORS[s.payment_method] || '#94a3b8' }}>{PAY_LABELS[s.payment_method] || s.payment_method}</span></td>
                    <td className="py-2 pr-3 text-slate-600">{units}</td>
                    <td className="py-2 pr-3 text-right font-bold text-slate-900">{fmtCur(s.total)}</td>
                    <td className="py-2 pr-3"><span className={`text-xs font-semibold ${s.status === 'paid' ? 'text-emerald-600' : s.status === 'pending' ? 'text-amber-600' : 'text-slate-400'}`}>{s.status}</span></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Sin ventas.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}