import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Calendar, MapPin, Ticket as TicketIcon, ArrowLeft } from 'lucide-react';
import { ticketApi } from '@/lib/ticketApi';

export default function TicketStore() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await ticketApi.listEvents();
        setEvents(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(164_72%_24%)] text-sm font-extrabold text-white">A</span>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Entradas</h1>
              <p className="text-xs text-slate-500">Comprá online y presentá tu QR en la puerta</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center">
            <TicketIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-base font-bold text-slate-700">No hay eventos con venta abierta</p>
            <p className="mt-1 text-sm text-slate-400">Volvé más tarde para ver las próximas fechas.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {events.map((evt) => (
              <Link
                key={evt.id}
                to={`/entradas/${evt.id}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative h-40 bg-slate-100">
                  {evt.image_url ? (
                    <img src={evt.image_url} alt={evt.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center bg-gradient-to-br from-emerald-50 to-slate-100">
                      <TicketIcon className="h-10 w-10 text-emerald-300" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-900 group-hover:text-emerald-700">{evt.name}</h2>
                  {evt.venue && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="h-4 w-4" /> {evt.venue}
                    </p>
                  )}
                  {evt.start_at && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="h-4 w-4" /> {new Date(evt.start_at).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}
                    </p>
                  )}
                  {evt.description && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{evt.description}</p>}
                  <span className="mt-4 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                    Ver entradas →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}