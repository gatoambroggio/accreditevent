import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Loader2, CheckCircle2, Clock, XCircle, Download, Home, RefreshCw, ShieldCheck } from 'lucide-react';
import { ticketApi } from '@/lib/ticketApi';
import { generateTotp, nowCounter, secondsRemaining, encodeDynamicQr } from '@/lib/totp';

export default function TicketConfirmation() {
  const [params] = useSearchParams();
  const ticketId = params.get('ticket_id');
  const initialStatus = params.get('status');
  const isDemo = params.get('demo') === '1';
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [secsLeft, setSecsLeft] = useState(30);
  const qrRef = useRef(null);
  const lastCounter = useRef(-1);

  // Carga inicial + sondeo de estado de pago.
  useEffect(() => {
    if (!ticketId) { setError('Falta el identificador de la entrada.'); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const t = await ticketApi.getTicket(ticketId);
        if (cancelled) return;
        setTicket(t);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const t = await ticketApi.getTicket(ticketId);
        if (cancelled) return;
        setTicket(t);
        if (['paid', 'used', 'cancelled', 'refunded'].includes(t.status)) clearInterval(interval);
      } catch {}
    }, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 90000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); };
  }, [ticketId]);

  const paid = ticket && (ticket.status === 'paid' || ticket.status === 'used');

  // Regenera el código TOTP del QR dinámico cada vez que cambia la ventana de 30s.
  const refreshQr = useCallback(async () => {
    if (!paid || !ticket?.qr_secret) return;
    const counter = nowCounter();
    if (counter === lastCounter.current) {
      setSecsLeft(secondsRemaining());
      return;
    }
    lastCounter.current = counter;
    try {
      const code = await generateTotp(ticket.qr_secret, counter);
      setQrValue(encodeDynamicQr(ticket.id, code));
    } catch {}
    setSecsLeft(secondsRemaining());
  }, [paid, ticket]);

  useEffect(() => {
    if (!paid) return;
    refreshQr();
    const tick = setInterval(refreshQr, 1000);
    return () => clearInterval(tick);
  }, [paid, refreshQr]);

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `entrada-${ticket?.qr_code || 'qr'}.png`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-[hsl(120_14%_97%)]">
        <div className="mx-auto max-w-md px-5 py-16">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center">
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <p className="mt-3 text-sm font-semibold text-red-700">{error || 'No se pudo encontrar la entrada.'}</p>
            <Link to="/entradas" className="mt-4 inline-block text-sm font-bold text-emerald-700 hover:underline">← Volver a entradas</Link>
          </div>
        </div>
      </div>
    );
  }

  const stages = ticket.validation_stages || [];
  const passed = ticket.stages_passed || [];

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <main className="mx-auto max-w-md px-5 py-10">
        {/* Estado */}
        <div className={`rounded-2xl border px-5 py-4 text-center ${paid ? 'border-emerald-200 bg-emerald-50' : ticket.status === 'pending' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          {paid ? (
            <>
              {isDemo && (
                <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-300">
                  Modo demo
                </span>
              )}
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-lg font-extrabold text-emerald-800">¡Entrada confirmada!</p>
              <p className="text-sm text-emerald-700">Presentá este QR en la puerta.</p>
            </>
          ) : ticket.status === 'pending' ? (
            <>
              <Clock className="mx-auto h-10 w-10 text-amber-500" />
              <p className="mt-2 text-lg font-extrabold text-amber-800">Pago en proceso</p>
              <p className="text-sm text-amber-700">Estamos confirmando tu pago. Esta pantalla se actualiza sola.</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-10 w-10 text-red-500" />
              <p className="mt-2 text-lg font-extrabold text-red-800">
                {ticket.status === 'cancelled' ? 'Pago rechazado' : ticket.status === 'refunded' ? 'Entrada reembolsada' : 'Entrada no válida'}
              </p>
              <p className="text-sm text-red-700">Iniciá la compra nuevamente si querés intentar otra vez.</p>
            </>
          )}
        </div>

        {/* QR dinámico + datos */}
        {paid && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-bold text-slate-900">{ticket.event_name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{ticket.ticket_type_name} · {ticket.quantity} entrada(s)</p>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
              <RefreshCw className="h-3.5 w-3.5" /> QR dinámico · rota en {secsLeft}s
            </div>
            <div ref={qrRef} className="mt-2 flex justify-center">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <QRCodeCanvas value={qrValue || ticket.qr_code} size={220} includeMargin={false} level="M" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
              El código se renueva cada 30s. Mantené la pantalla encendida en la puerta.
            </p>
            <p className="mt-3 font-mono text-xs text-slate-400">Código de respaldo: {ticket.qr_code}</p>

            <div className="mt-4 space-y-1 text-sm text-slate-600">
              <p><span className="text-slate-400">Titular:</span> {ticket.buyer_name}</p>
              {ticket.buyer_dni && <p><span className="text-slate-400">DNI:</span> {ticket.buyer_dni}</p>}
              <p><span className="text-slate-400">Total:</span> ${Number(ticket.total).toLocaleString('es-AR')}</p>
            </div>

            {/* Progreso de etapas */}
            {stages.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Etapas de control</p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {stages.map((s) => {
                    const ok = passed.includes(s.value);
                    return (
                      <span key={s.value} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'}`}>
                        {ok && <CheckCircle2 className="h-3 w-3" />} {s.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={downloadQr} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Descargar QR (fotograma actual)
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link to="/entradas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
            <Home className="h-4 w-4" /> Volver a entradas
          </Link>
        </div>
      </main>
    </div>
  );
}