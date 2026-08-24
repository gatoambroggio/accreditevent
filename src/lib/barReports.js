export const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export const PAY_LABELS = { cash: 'Efectivo', card: 'Tarjeta', qr: 'QR MP', demo: 'Demo' };
export const PAY_COLORS = { cash: '#10b981', card: '#6366f1', qr: '#3b82f6', demo: '#f59e0b' };

export const RANGES = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: 'all', label: 'Todo el evento' },
];

// Filtra ventas por rango de fecha basado en created_date.
export function filterByRange(sales, range) {
  if (range === 'all') return sales;
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return sales.filter((s) => new Date(s.created_date) >= start);
  }
  if (range === 'yesterday') {
    const start = new Date(now); start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setHours(23, 59, 59, 999);
    return sales.filter((s) => { const d = new Date(s.created_date); return d >= start && d <= end; });
  }
  if (range === '7d') {
    const start = new Date(now); start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0);
    return sales.filter((s) => new Date(s.created_date) >= start);
  }
  return sales;
}

export function aggregateStats(paid) {
  const totalRevenue = paid.reduce((s, x) => s + Number(x.total || 0), 0);
  const ticketCount = paid.length;
  const avgTicket = ticketCount ? totalRevenue / ticketCount : 0;
  let units = 0;
  for (const s of paid) for (const it of (s.items || [])) units += Number(it.qty || 0);
  const distinct = new Set(paid.flatMap((s) => (s.items || []).map((it) => it.name))).size;
  return { totalRevenue, ticketCount, avgTicket, units, distinct };
}

export function byPaymentMethod(paid) {
  const m = {};
  for (const s of paid) {
    const k = s.payment_method || 'cash';
    if (!m[k]) m[k] = { method: k, label: PAY_LABELS[k] || k, total: 0, count: 0 };
    m[k].total += Number(s.total || 0);
    m[k].count += 1;
  }
  return Object.values(m).sort((a, b) => b.total - a.total);
}

export function byBar(paid) {
  const m = {};
  for (const s of paid) {
    const key = s.bar_name || s.bar_id || 'Sin barra';
    if (!m[key]) m[key] = { name: key, total: 0, count: 0, units: 0 };
    m[key].total += Number(s.total || 0);
    m[key].count += 1;
    for (const it of (s.items || [])) m[key].units += Number(it.qty || 0);
  }
  return Object.values(m).sort((a, b) => b.total - a.total);
}

export function hourlySales(paid) {
  const m = {};
  for (let h = 0; h < 24; h++) m[h] = { hour: `${String(h).padStart(2, '0')}hs`, total: 0, count: 0 };
  for (const s of paid) {
    const h = new Date(s.created_date).getHours();
    m[h].total += Number(s.total || 0);
    m[h].count += 1;
  }
  return Object.values(m);
}

export function topProducts(paid, limit = 12) {
  const m = {};
  for (const s of paid) for (const it of (s.items || [])) {
    if (!m[it.name]) m[it.name] = { name: it.name, qty: 0, revenue: 0 };
    m[it.name].qty += Number(it.qty || 0);
    m[it.name].revenue += Number(it.subtotal || 0);
  }
  const arr = Object.values(m).sort((a, b) => b.revenue - a.revenue);
  const totalRev = arr.reduce((s, x) => s + x.revenue, 0);
  return arr.slice(0, limit).map((p) => ({ ...p, pct: totalRev ? (p.revenue / totalRev) * 100 : 0 }));
}

export function byOperator(paid) {
  const m = {};
  for (const s of paid) {
    const key = s.operator_name || 'Sin operador';
    if (!m[key]) m[key] = { name: key, total: 0, count: 0 };
    m[key].total += Number(s.total || 0);
    m[key].count += 1;
  }
  return Object.values(m).sort((a, b) => b.total - a.total);
}

export function byCategory(paid, productCategoryMap) {
  const m = {};
  for (const s of paid) for (const it of (s.items || [])) {
    const cat = productCategoryMap[it.name] || 'Sin categoría';
    if (!m[cat]) m[cat] = { name: cat, qty: 0, revenue: 0 };
    m[cat].qty += Number(it.qty || 0);
    m[cat].revenue += Number(it.subtotal || 0);
  }
  return Object.values(m).sort((a, b) => b.revenue - a.revenue);
}

export function exportCsv(sales, eventId) {
  const rows = [['Fecha', 'Hora', 'Barra', 'Operador', 'Método', 'Estado', 'Items', 'Unidades', 'Total']];
  for (const s of sales) {
    const d = new Date(s.created_date);
    const units = (s.items || []).reduce((u, it) => u + Number(it.qty || 0), 0);
    rows.push([
      d.toLocaleDateString('es-AR'),
      d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      s.bar_name || '', s.operator_name || '',
      PAY_LABELS[s.payment_method] || s.payment_method || '', s.status || '',
      (s.items || []).length, units, s.total,
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = `reporte-barras-${eventId}.csv`; a.click(); URL.revokeObjectURL(url);
}