import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Calendar, MapPin, Minus, Plus, AlertTriangle, Lock } from 'lucide-react';
import { ticketApi } from '@/lib/ticketApi';

export default function TicketEvent() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({ buyer_name: '', buyer_dni: '', buyer_email: '', buyer_phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await ticketApi.getEvent(eventId);
        setEvent(data);
        const firstActive = data.ticket_types?.find((t) => t.available > 0);
        if (firstActive) setSelectedType(firstActive);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const saleClosed = event?.sale && (event.sale.closed || !event.sale.open || !event.sale.enabled);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedType) return setSubmitError('Elegí un tipo de entrada.');
    if (!form.buyer_name.trim()) return setSubmitError('Ingresá tu nombre.');
    if (quantity < 1) return setSubmitError('La cantidad debe ser al menos 1.');
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await ticketApi.createOrder({
        event_id: eventId,
        ticket_type_id: selectedType.id,
        buyer_name: form.buyer_name.trim(),
        buyer_dni: form.buyer_dni.trim() || undefined,
        buyer_email: form.buyer_email.trim() || undefined,
        buyer_phone: form.buyer_phone.trim() || undefined,
        quantity,
      });
      if (res.init_point) {
        window.location.href = res.init_point;
      } else if (res.demo && res.ticket_id) {
        navigate(`/entradas/confirmacion?ticket_id=${res.ticket_id}&status=success&demo=1`);
      } else {
        navigate(`/entradas/confirmacion?ticket_id=${res.ticket_id}&status=failure`);
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(120_14%_97%)]">
        <div className="mx-auto max-w-2xl px-5 py-16">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <Link to="/entradas" className="mt-4 inline-block text-sm font-bold text-emerald-700 hover:underline">← Volver a entradas</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <Link to="/entradas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Entradas
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{event.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            {event.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {event.venue}</span>}
            {event.start_at && <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" /> {new Date(event.start_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {saleClosed ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-12 text-center">
            <Lock className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-3 text-base font-bold text-amber-800">
              {event.sale?.closed ? 'La venta de entradas ya finalizó' : 'La venta de entradas aún no está abierta'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {event.sale?.description && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-600">{event.sale.description}</p>
                {event.sale.address && <p className="mt-2 text-sm text-slate-500"><MapPin className="mr-1 inline h-4 w-4" />{event.sale.address}</p>}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">1 · Elegí tu entrada</h2>
              <div className="mt-3 space-y-2">
                {event.ticket_types.length === 0 && <p className="text-sm text-slate-400">No hay tipos de entrada configurados.</p>}
                {event.ticket_types.map((t) => {
                  const active = selectedType?.id === t.id;
                  const disabled = t.available <= 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedType(t)}
                      className={`w-full rounded-xl border p-4 text-left transition ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60' : active ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{t.name}</p>
                          {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
                          <p className="mt-1 text-xs text-slate-400">
                            {disabled ? 'Agotado' : `${t.available} disponibles · máx. ${t.limit_per_purchase} por compra`}
                          </p>
                        </div>
                        <p className="text-lg font-extrabold text-emerald-700">${Number(t.price).toLocaleString('es-AR')}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">2 · Cantidad y tus datos</h2>

              <div className="mt-3">
                <label className="text-xs font-semibold text-slate-600">Cantidad</label>
                <div className="mt-1 flex items-center gap-3">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-slate-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(selectedType?.limit_per_purchase || 10, selectedType?.available || 0, q + 1))}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="ml-2 text-sm text-slate-500">
                    Total: <span className="font-bold text-slate-900">${(selectedType ? selectedType.price * quantity : 0).toLocaleString('es-AR')}</span>
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Nombre y apellido *">
                  <input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Juan Pérez" />
                </Field>
                <Field label="DNI">
                  <input value={form.buyer_dni} onChange={(e) => setForm({ ...form, buyer_dni: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="12345678" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="juan@email.com" />
                </Field>
                <Field label="Teléfono">
                  <input value={form.buyer_phone} onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="+54 9 11 ..." />
                </Field>
              </div>

              {submitError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedType}
                className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
              >
                {submitting ? 'Iniciando pago…' : `Pagar con Mercado Pago · $${(selectedType ? selectedType.price * quantity : 0).toLocaleString('es-AR')}`}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">Serás redirigido a Mercado Pago para completar el pago de forma segura.</p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}