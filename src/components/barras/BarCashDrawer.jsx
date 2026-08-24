import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wallet, X, ArrowDownToLine, ArrowUpFromLine, Lock, Printer } from 'lucide-react';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fmtTime = (d) => {
  try { return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
const TYPE_LABEL = { open: 'Apertura', withdraw: 'Retiro', close: 'Cierre' };

export default function BarCashDrawer({ barId, operatorId, operatorName, onWithdrawPrint, padron }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [modal, setModal] = useState(null); // 'open' | 'withdraw' | 'close' | null
  const [amount, setAmount] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [responsibleDni, setResponsibleDni] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dniOpen, setDniOpen] = useState(false);
  const dniMatches = (modal === 'withdraw' && padron && responsibleDni.length >= 1)
    ? padron.filter((o) => o.status !== 'inactive' && String(o.dni || '').includes(responsibleDni)).slice(0, 6)
    : [];
  const pickDni = (o) => {
    setResponsibleDni(o.dni);
    setResponsibleName(`${o.first_name} ${o.last_name}`.trim());
    setDniOpen(false);
  };
  const onDniChange = (v) => {
    setResponsibleDni(v);
    setDniOpen(true);
    const exact = padron?.find((o) => o.dni === v && o.status !== 'inactive');
    if (exact) setResponsibleName(`${exact.first_name} ${exact.last_name}`.trim());
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('barSale', { action: 'get_cash_status', bar_id: barId });
      const d = res?.data || res;
      if (d?.error) throw new Error(d.error);
      setStatus(d);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (open) { setErr(''); load(); } }, [open, barId]);

  const reset = () => { setAmount(''); setResponsibleName(''); setResponsibleDni(''); setNote(''); setErr(''); setDniOpen(false); setModal(null); };

  const submit = async () => {
    setErr('');
    const amt = Number(amount);
    if (!amt || amt < 0) { setErr('Ingresá un monto válido'); return; }
    if (modal === 'withdraw' && !responsibleDni) { setErr('El DNI de quien retira es obligatorio'); return; }
    setBusy(true);
    try {
      const action = modal === 'open' ? 'open_cash' : modal === 'withdraw' ? 'withdraw_cash' : 'close_cash';
      const payload = { action, bar_id: barId, amount: amt, operator_id: operatorId, operator_name: operatorName, note };
      if (modal === 'withdraw') { payload.responsible_name = responsibleName; payload.responsible_dni = responsibleDni; }
      const res = await base44.functions.invoke('barSale', payload);
      const d = res?.data || res;
      if (d?.error) throw new Error(d.error);
      if (modal === 'withdraw' && d.movement && onWithdrawPrint) onWithdrawPrint(d.movement);
      reset();
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
        <Wallet className="h-3.5 w-3.5" /> Caja
      </button>

      {open && (
        <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => !busy && setOpen(false)}>
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Wallet className="h-5 w-5" /></span>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Caja</h2>
                {status?.session_open && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Abierta</span>}
              </div>
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Saldo en caja</p>
                    <p className="mt-1 text-xl font-extrabold text-slate-900">{fmtCur(status?.balance)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Ventas efectivo</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">{fmtCur(status?.cash_sales_total)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Retiros</p>
                    <p className="mt-1 text-sm font-bold text-amber-700">-{fmtCur(status?.withdraw_total)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button onClick={() => { setModal('open'); setAmount(''); setErr(''); }} disabled={busy} className="flex flex-col items-center gap-1 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                    <ArrowUpFromLine className="h-5 w-5" /> Apertura
                  </button>
                  <button onClick={() => { setModal('withdraw'); setAmount(''); setErr(''); }} disabled={busy} className="flex flex-col items-center gap-1 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                    <ArrowDownToLine className="h-5 w-5" /> Retiro
                  </button>
                  <button onClick={() => { setModal('close'); setAmount(''); setErr(''); }} disabled={busy} className="flex flex-col items-center gap-1 rounded-xl border-2 border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                    <Lock className="h-5 w-5" /> Cierre
                  </button>
                </div>

                {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

                <div className="mt-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Movimientos recientes</h3>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-100">
                    {(!status?.movements || status.movements.length === 0) ? (
                      <p className="px-3 py-6 text-center text-sm text-slate-400">Sin movimientos todavía.</p>
                    ) : status.movements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                        <div>
                          <p className="font-semibold text-slate-800">{TYPE_LABEL[m.type] || m.type} · {fmtTime(m.created_date || m.created_at)}</p>
                          <p className="text-xs text-slate-400">Op: {m.operator_name || '—'}{m.responsible_name ? ` · ${m.responsible_name}` : ''}{m.responsible_dni ? ` · DNI ${m.responsible_dni}` : ''}</p>
                        </div>
                        <span className={`font-extrabold ${m.type === 'withdraw' ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {m.type === 'withdraw' ? '-' : ''}{fmtCur(m.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => !busy && reset()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">{modal === 'open' ? 'Apertura de caja' : modal === 'withdraw' ? 'Retiro de efectivo' : 'Cierre de caja'}</h3>
              <button onClick={() => !busy && reset()} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">{modal === 'close' ? 'Efectivo contado' : 'Monto'}</span>
                <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-extrabold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              {modal === 'withdraw' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">DNI de quien retira *</span>
                    <div className="relative">
                      <input
                        value={responsibleDni}
                        onChange={(e) => onDniChange(e.target.value)}
                        onFocus={() => setDniOpen(true)}
                        onBlur={() => setTimeout(() => setDniOpen(false), 150)}
                        placeholder="DNI"
                        autoFocus
                        className="normal-case w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      {dniOpen && dniMatches.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {dniMatches.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); pickDni(o); }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50"
                            >
                              <span className="font-semibold text-slate-800">{o.last_name}, {o.first_name}</span>
                              <span className="font-mono text-xs text-slate-500">{o.dni}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {padron && padron.length > 0 && (
                      <span className="mt-1 block text-[11px] text-slate-400">Si el DNI está en el padrón, se completa el nombre solo.</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre (opcional)</span>
                    <input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder="Nombre y apellido" className="normal-case w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                  </label>
                </>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">{modal === 'withdraw' ? 'Motivo / aclaración' : 'Observación'}</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={modal === 'withdraw' ? 'Ej. pago a proveedor' : ''} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => !busy && reset()} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : modal === 'withdraw' ? <><Printer className="h-4 w-4" /> Retirar e imprimir</> : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}