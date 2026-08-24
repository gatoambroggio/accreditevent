import { downloadXlsx } from './exportXlsx';
import { filterByRange, RANGES } from './barReports';

export { RANGES };

export const MOV_LABELS = { open: 'Apertura', withdraw: 'Retiro', close: 'Cierre' };
export const MOV_COLORS = { open: '#10b981', withdraw: '#ef4444', close: '#6366f1' };

const fmtDate = (d) =>
  new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Filtra movimientos por rango de fecha, tipo, barra y búsqueda de texto
// (operador / responsable). El rango usa created_date.
export function filterMovements(movs, { range, type, barId, q }) {
  let r = filterByRange(movs, range);
  if (type !== 'all') r = r.filter((m) => m.type === type);
  if (barId !== 'all') r = r.filter((m) => m.bar_id === barId);
  if (q) {
    const s = q.toLowerCase();
    r = r.filter((m) =>
      `${m.operator_name || ''} ${m.responsible_name || ''} ${m.responsible_dni || ''} ${m.note || ''}`
        .toLowerCase()
        .includes(s)
    );
  }
  return r;
}

// Diferencia del cierre: efectivo contado (amount) - saldo esperado (balance_after).
export function closeDiff(m) {
  if (m.type !== 'close') return null;
  return Number(m.amount || 0) - Number(m.balance_after || 0);
}

export function aggregateCash(movs) {
  const active = movs.filter((m) => m.status !== 'void');
  const open = active.filter((m) => m.type === 'open');
  const withdraw = active.filter((m) => m.type === 'withdraw');
  const close = active.filter((m) => m.type === 'close');
  const openTotal = open.reduce((s, m) => s + Number(m.amount || 0), 0);
  const withdrawTotal = withdraw.reduce((s, m) => s + Number(m.amount || 0), 0);
  const countedTotal = close.reduce((s, m) => s + Number(m.amount || 0), 0);
  const expectedTotal = close.reduce((s, m) => s + Number(m.balance_after || 0), 0);
  return {
    openTotal,
    withdrawTotal,
    openCount: open.length,
    withdrawCount: withdraw.length,
    closeCount: close.length,
    countedTotal,
    expectedTotal,
    diffTotal: countedTotal - expectedTotal,
  };
}

export function exportCashXlsx(movs, eventName) {
  const movRows = movs.map((m) => {
    const diff = closeDiff(m);
    return {
      Fecha: fmtDate(m.created_date),
      Barra: m.bar_name || '',
      Evento: m.event_name || '',
      Tipo: MOV_LABELS[m.type] || m.type,
      Monto: Number(m.amount || 0),
      Operador: m.operator_name || '',
      Responsable: m.responsible_name || '',
      DNI: m.responsible_dni || '',
      Motivo: m.note || '',
      'Saldo posterior': m.balance_after != null ? Number(m.balance_after) : '',
      Diferencia: diff != null ? Number(diff.toFixed(2)) : '',
      Estado: m.status === 'void' ? 'Anulado' : 'Activo',
    };
  });
  const agg = aggregateCash(movs);
  const resumen = [
    { Métrica: 'Aperturas', Cantidad: agg.openCount, Monto: agg.openTotal },
    { Métrica: 'Retiros', Cantidad: agg.withdrawCount, Monto: agg.withdrawTotal },
    { Métrica: 'Cierres', Cantidad: agg.closeCount, Monto: agg.countedTotal },
    { Métrica: 'Saldo esperado (cierres)', Cantidad: '', Monto: agg.expectedTotal },
    { Métrica: 'Diferencia total (cierres)', Cantidad: '', Monto: Number(agg.diffTotal.toFixed(2)) },
  ];
  const name = (eventName || 'caja').toString().toLowerCase().replace(/\s+/g, '-');
  downloadXlsx(`reporte-caja-${name}.xlsx`, [
    { name: 'Movimientos', rows: movRows },
    { name: 'Resumen', rows: resumen },
  ]);
}