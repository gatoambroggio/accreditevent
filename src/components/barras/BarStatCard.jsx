import React from 'react';
import { TrendingUp, Receipt, Calculator, Package, Coins } from 'lucide-react';
import { fmtCur } from '@/lib/barReports';

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-50 text-amber-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  sky: 'bg-sky-50 text-sky-700',
};

function Card({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-5 w-5" /></span>
        <span className="text-sm font-semibold text-slate-500">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function BarStats({ stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card icon={TrendingUp} label="Total vendido" value={fmtCur(stats.totalRevenue)} tone="emerald" />
      <Card icon={Receipt} label="Tickets cobrados" value={stats.ticketCount} tone="slate" />
      <Card icon={Calculator} label="Ticket promedio" value={fmtCur(stats.avgTicket)} tone="indigo" />
      <Card icon={Package} label="Unidades vendidas" value={stats.units} tone="amber" />
      <Card icon={Coins} label="Productos distintos" value={stats.distinct} tone="sky" />
    </div>
  );
}