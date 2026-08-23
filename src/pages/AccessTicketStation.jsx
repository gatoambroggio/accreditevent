import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, Calendar, ArrowLeft, Ticket as TicketIcon } from 'lucide-react';
import QrScanner from '@/components/QrScanner';
import { base44 } from '@/api/base44Client';

const API_BASE = (import.meta.env?.VITE_API_URL) || '/api';

export default function AccessTicketStation() {
  const [phase, setPhase] = useState('select');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [cycle, setCycle] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const qrCooldown = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.list('-start_at', 100);
        setEvents(data);
      } catch {}
      setLoadingEvents(false);
    })();
  }, []);

  const startStation = () => {
    const evt = events.find((e) => e.id === selectedEventId);
    if (!evt) return;
    setSelectedEvent(evt);
    setPhase('active');
    setCycle((c) => c + 1);
    setResult(null);
  };

  const handleQrDetected = async (rawCode) => {
    if (qrCooldown.current || verifying || result) return;
    qrCooldown.current = true;
    setVerifying(true);
    const code = String(rawCode || '').trim();
    try {
      let data;
      try {
        // Base44 cloud: función autenticada (el operador tiene token).
        const res = await base44.functions.invoke('ticketAccess', { action: 'validate', qr_code: code, event_id: selectedEvent.id });
        data = res.data;
      } catch {
        // Fallback al servidor self-hosted.
        const res = await fetch(`${API_BASE}/ticket-access/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ae_access_token') || ''}` },
          body: JSON.stringify({ qr_code: code, event_id: selectedEvent.id }),
        });
        data = await res.json();
      }
      setResult(data);
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setVerifying(false);
      setTimeout(() => { qrCooldown.current = false; }, 600);
    }
  };

  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => { setResult(null); setCycle((c) => c + 1); }, 2000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]"><TicketIcon className="h-4 w-4" /></span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Control de Entradas</span>
          </div>
          <div className="flex items-center gap-4">
            {phase === 'active' && <button onClick={() => { setPhase('select'); setSelectedEvent(null); setSelectedEventId(''); }} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Cambiar evento</button>}
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">Panel</Link>
          </div>
        </div>
      </div>

      {phase === 'select' && (
        <div className="mx-auto max-w-2xl px-5 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Calendar className="h-5 w-5" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Validación de entradas</h2>
                <p className="text-sm text-slate-500">Elegí el evento y escaneá el QR de cada entrada en la puerta.</p>
              </div>
            </div>
            {loadingEvents ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
            ) : events.length === 0 ? (
              <p className="text-sm text-slate-400">No hay eventos.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {events.map((evt) => (
                    <button key={evt.id} onClick={() => setSelectedEventId(evt.id)} className={`w-full rounded-xl border p-4 text-left transition ${selectedEventId === evt.id ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <p className="font-bold text-slate-900">{evt.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{evt.venue || 'Sin sede'}</p>
                    </button>
                  ))}
                </div>
                <button onClick={startStation} disabled={!selectedEventId} className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">Iniciar control de entradas</button>
              </>
            )}
          </div>
        </div>
      )}

      {phase === 'active' && selectedEvent && (
        <div className="mx-auto max-w-2xl px-5 py-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><TicketIcon className="h-5 w-5" /></div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedEvent.name}</h2>
                <p className="text-sm text-slate-500">Enfocá el QR de la entrada.</p>
              </div>
            </div>
            {verifying ? (
              <div className="flex flex-col items-center justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-emerald-600" /><span className="mt-3 text-sm text-slate-500">Verificando…</span></div>
            ) : (
              <QrScanner key={cycle} onDetected={handleQrDetected} paused={verifying || !!result} />
            )}
          </div>
        </div>
      )}

      {result && (
        <div className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600' : 'bg-red-600'}`} onClick={() => { setResult(null); setCycle((c) => c + 1); }}>
          {result.ok ? <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} /> : <XCircle className="h-32 w-32 text-white" strokeWidth={1.5} />}
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">{result.ok ? 'ACEPTADO' : 'DENEGADO'}</p>
          {result.ok && result.ticket && (
            <>
              <p className="mt-4 text-xl font-bold text-white">{result.ticket.buyer_name}</p>
              <p className="mt-1 text-white/80">{result.ticket.ticket_type_name} · {result.ticket.quantity} entrada(s)</p>
            </>
          )}
          {!result.ok && result.message && <p className="mt-2 max-w-md px-6 text-center text-sm text-white/80">{result.message}</p>}
        </div>
      )}
    </div>
  );
}