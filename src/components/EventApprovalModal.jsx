import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, XCircle, Clock, CalendarDays, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';

export default function EventApprovalModal({ providerCompany, onClose }) {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const productoraCompany = user?.data?.company || user?.company || '';

  useEffect(() => {
    (async () => {
      try {
        const [evts, apprs] = await Promise.all([
          base44.entities.Event.filter({ company: productoraCompany }, '-start_at', 100),
          base44.entities.EventCompanyApproval.filter({ provider_company: providerCompany.name }),
        ]);
        setEvents(evts);
        setApprovals(apprs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const getApproval = (eventId) => approvals.find((a) => a.event_id === eventId);

  const setStatus = async (event, status) => {
    setSaving(event.id);
    try {
      const existing = getApproval(event.id);
      if (existing) {
        const updated = await base44.entities.EventCompanyApproval.update(existing.id, {
          status,
          approved_by: user?.full_name || user?.email,
        });
        setApprovals((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const created = await base44.entities.EventCompanyApproval.create({
          event_id: event.id,
          event_name: event.name,
          company: productoraCompany,
          provider_company: providerCompany.name,
          status,
          approved_by: user?.full_name || user?.email,
        });
        setApprovals((prev) => [...prev, created]);
      }
      await logAudit('approve-company-event', 'EventCompanyApproval', event.id, `${providerCompany.name} → ${event.name}: ${status}`);
    } catch {}
    setSaving(null);
  };

  const statusBadge = (st) => {
    if (st === 'approved') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="h-3 w-3" /> Aprobada</span>;
    if (st === 'rejected') return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"><XCircle className="h-3 w-3" /> Rechazada</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"><Clock className="h-3 w-3" /> Pendiente</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Aprobación por evento</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{providerCompany.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="mb-4 text-sm text-slate-500">Aprobá o rechazá esta empresa para cada evento. La empresa sólo podrá cargar empleados en los eventos donde esté aprobada.</p>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-400">No tenés eventos creados.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => {
                const ap = getApproval(ev.id);
                const st = ap?.status || 'pending';
                const isSaving = saving === ev.id;
                return (
                  <div key={ev.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{ev.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {statusBadge(st)}
                        {ev.start_at && <span className="text-xs text-slate-400">{new Date(ev.start_at).toLocaleDateString('es-AR')}</span>}
                      </div>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => setStatus(ev, 'approved')}
                        disabled={isSaving || st === 'approved'}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${st === 'approved' ? 'bg-emerald-600 text-white' : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'} disabled:opacity-50`}
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aprobar'}
                      </button>
                      <button
                        onClick={() => setStatus(ev, 'rejected')}
                        disabled={isSaving || st === 'rejected'}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${st === 'rejected' ? 'bg-red-600 text-white' : 'border border-red-200 text-red-700 hover:bg-red-50'} disabled:opacity-50`}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}