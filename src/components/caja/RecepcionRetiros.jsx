import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Search, ScanLine, CheckCircle2, Loader2, X, AlertCircle, Wallet, Clock } from 'lucide-react';
import QrScanner from '@/components/QrScanner';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fmtDate = (d) => {
  try { return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

export default function RecepcionRetiros({ eventId, onConfirmed }) {
  const { user } = useAuth();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const r = await base44.entities.BarCashMovement.filter(
        { event_id: eventId, type: 'withdraw', received: false },
        '-created_date',
        200
      );
      setPending((r || []).filter((m) => m.status !== 'void'));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  const filtered = pending.filter((m) => {
    if (!q) return true;
    const qq = norm(q);
    return norm(m.responsible_dni).includes(qq) || norm(m.ticket_code) === qq || norm(m.ticket_code).includes(qq);
  });

  const confirm = async (m) => {
    if (!m || m.received) return;
    setConfirming(true);
    setErr('');
    try {
      const by = user?.full_name || user?.email || 'Administración';
      await base44.entities.BarCashMovement.update(m.id, {
        received: true,
        received_at: new Date().toISOString(),
        received_by: by,
      });
      setSelected(null);
      await load();
      onConfirmed?.();
    } catch (e) {
      setErr(e.message);
    }
    setConfirming(false);
  };

  const onQr = (t) => {
    setScanning(false);
    const cc = String(t).trim().toUpperCase();
    setQ(cc);
    const m = pending.find((x) => norm(x.ticket_code) === norm(cc) && x.status !== 'void');
    if (m) setSelected(m);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Wallet className="h-4 w-4" /></span>
        <div>
          <h3 className="text-base font-bold text-slate-900">Recepción de retiros</h3>
          <p className="text-xs text-slate-500">Buscá por DNI, elegí un retiro pendiente o escaneá el QR del ticket para confirmar la recepción.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="DNI o código (ej. R-1234)"
            className="normal-case w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm font-bold tracking-wide"
          />
        </div>
        <button
          onClick={() => { setScanning(true); setErr(''); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ScanLine className="h-4 w-4" /> Escanear QR
        </button>
        {q && (
          <button onClick={() => { setQ(''); setSelected(null); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Limpiar">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </div>
      )}

      {selected ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">{selected.bar_name || 'Barra'}</p>
              {selected.event_name && <p className="text-xs text-slate-500">{selected.event_name}</p>}
              <p className="text-2xl font-extrabold text-amber-700">{fmtCur(selected.amount)}</p>
              <p className="text-xs text-slate-600">Retira: {selected.responsible_name || '—'} {selected.responsible_dni ? `· DNI ${selected.responsible_dni}` : ''}</p>
              <p className="text-xs text-slate-500">Operador: {selected.operator_name || '—'} · {fmtDate(selected.created_date)}</p>
              {selected.note && <p className="text-xs text-slate-500">Motivo: {selected.note}</p>}
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-bold tracking-wider text-slate-700">{selected.ticket_code}</p>
              <button
                onClick={() => confirm(selected)}
                disabled={confirming}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar recepción
              </button>
              <button onClick={() => setSelected(null)} className="mt-1 block text-xs font-semibold text-slate-400 hover:text-slate-600">Volver a la lista</button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="mt-4 flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          {pending.length === 0 ? 'No hay retiros pendientes de recibir.' : 'Ningún retiro pendiente coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Clock className="h-3.5 w-3.5" /> {q ? `${filtered.length} coincidencia${filtered.length === 1 ? '' : 's'}` : `${pending.length} pendiente${pending.length === 1 ? '' : 's'}`}
          </p>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">{m.bar_name || 'Barra'} · {fmtCur(m.amount)}</p>
                  <p className="truncate text-xs text-slate-500">
                    DNI {m.responsible_dni || '—'}{m.responsible_name ? ` · ${m.responsible_name}` : ''} · {fmtDate(m.created_date)}
                  </p>
                </div>
                <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{m.ticket_code || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {scanning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setScanning(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Escanear QR del retiro</h3>
              <button onClick={() => setScanning(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <QrScanner paused={false} onDetected={onQr} />
          </div>
        </div>
      )}
    </div>
  );
}