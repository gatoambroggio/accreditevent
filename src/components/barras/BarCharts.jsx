import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { fmtCur, PAY_COLORS } from '@/lib/barReports';

function Section({ title, children, height = 280 }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <div className="mt-4" style={{ height }}>{children}</div>
    </section>
  );
}

export default function BarCharts({ byBar, hourly, byMethod }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Ventas por barra">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => fmtCur(v)} />
            <Bar dataKey="total" fill="hsl(164 72% 24%)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Ventas por hora">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v) => fmtCur(v)} />
            <Area type="monotone" dataKey="total" stroke="hsl(39 86% 63%)" fill="hsl(39 86% 63% / 0.2)" />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Ventas por método de pago" height={300}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={byMethod} dataKey="total" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.label}: ${fmtCur(e.total)}`}>
              {byMethod.map((m) => <Cell key={m.method} fill={PAY_COLORS[m.method] || '#94a3b8'} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtCur(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}