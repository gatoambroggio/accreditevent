import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Search, ScanLine, CheckCircle2, Loader2, X, AlertCircle, Wallet } from 'lucide-react';
import QrScanner from '@/components/QrScanner';

const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const fmtDate = (d) =>
  new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function RecepcionRetiros({ onConfirmed }) {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [looking, setLooking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');

  const lookup = async (raw) => {
    setErr('');
    setFound(null);
    const cc = (raw ?? code).trim().toUpperCase();
    if (!cc) return;
    setLooking(true);
    try {
      const res = await base44.entities.BarCashMovement.filter({ ticket_code: cc }, '-created_date', 5);
      const m = (res || [])[0];
      if (!m) setErr('No se encontró un retiro con ese código.');
      else if (m.type !== 'withdraw') setErr('Ese código no corresponde a un retiro.');
      else setFound(m);
    } catch (e) {
      setErr(e.message);
    }
    setLooking(false);
  };

  const confirm = async () => {
    if (!found || found.received) return;
    setConfirming(true);
    setErr('');
    try {
      const by = user?.full_name || user?.email || 'Administración';
      await base44.entities.BarCashMovement.update(found.id, {
        received: true,
        received_at: new Date().toISOString(),
        received_by: by,
      });
      setFound({ ...found, received: true, received_at: new Date().toISOString(), received_by: by });
      onConfirmed?.();
    } catch (e) {
      setErr(e.message);
    }
    setConfirming(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Wallet className="h-4 w-4" /></span>
        <div>
          <h3 className="text-base font-bold text-slate-900">Recepción de retiros</h3>
          <p className="text-xs text-slate-500">Ingresá el código del ticket o escaneá el QR para confirmar que administración recibió el efectivo.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="Ej. R-1234"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm font-bold tracking-wider"
          />
        </div>
        <button
          onClick={() => { setScanning(true); setErr(''); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ScanLine className="h-4 w-4" /> Escanear QR
        </button>
        <button
          onClick={() => lookup()}
          disabled={looking || !code}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
        </button>
      </div>

      {err && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </div>
      )}

      {found && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900">{found.bar_name || 'Barra'}</p>
              {found.event_name && <p className="text-xs text-slate-500">{found.event_name}</p>}
              <p className="text-2xl font-extrabold text-amber-700">{fmtCur(found.amount)}</p>
              <p className="text-xs text-slate-600">Retira: {found.responsible_name || '-'} {found.responsible_dni ? `· DNI ${found.responsible_dni}` : ''}</p>
              <p className="text-xs text-slate-500">Operador: {found.operator_name || '-'} · {fmtDate(found.created_date)}</p>
              {found.note && <p className="text-xs text-slate-500">Motivo: {found.note}</p>}
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-bold tracking-wider text-slate-700">{found.ticket_code}</p>
              {found.received ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Recibido
                </span>
              ) : found.status === 'void' ? (
                <span className="mt-2 inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Anulado</span>
              ) : (
                <button
                  onClick={confirm}
                  disabled={confirming}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar recepción
                </button>
              )}
              {found.received && (
                <p className="mt-1 text-[11px] text-slate-500">Por {found.received_by || '-'} · {found.received_at ? fmtDate(found.received_at) : ''}</p>
              )}
            </div>
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
            <QrScanner
              paused={false}
              onDetected={(t) => {
                setScanning(false);
                setCode(String(t).toUpperCase());
                lookup(String(t).toUpperCase());
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}