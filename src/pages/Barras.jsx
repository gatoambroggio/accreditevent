import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Pencil, Wine, ExternalLink, BarChart3, Cpu } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/page-header';
import BarFormModal from '@/components/barras/BarFormModal';
import BarPosDevices from '@/components/barras/BarPosDevices';
import EventMenu from '@/components/barras/EventMenu';
import BarOperators from '@/components/barras/BarOperators';
import BarTablets from '@/components/barras/BarTablets';

export default function Barras() {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [barModal, setBarModal] = useState(null);
  const [posBar, setPosBar] = useState(null);
  const [tab, setTab] = useState('barras');

  useEffect(() => {
    (async () => {
      try { const evs = await base44.entities.Event.list('-start_at', 200); setEvents(evs); } catch {}
      setLoading(false);
    })();
  }, []);

  const loadBars = useCallback(async (id) => {
    if (!id) { setBars([]); return; }
    setLoading(true);
    try { const b = await base44.entities.Bar.filter({ event_id: id }, 'name', 100); setBars(b); }
    catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setLoading(false);
  }, [toast]);

  const saveBar = async (b) => {
    try {
      const ev = events.find((e) => e.id === (b.event_id || eventId));
      const clean = { ...b, event_id: b.event_id || eventId, event_name: ev?.name, company: ev?.company };
      if (b.id) await base44.entities.Bar.update(b.id, clean);
      else await base44.entities.Bar.create(clean);
      setBarModal(null);
      await loadBars(eventId);
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const deleteBar = async (b) => {
    if (!confirm(`¿Eliminar la barra "${b.name}"?`)) return;
    try { await base44.entities.Bar.delete(b.id); await loadBars(eventId); } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
        <button onClick={() => setTab('barras')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'barras' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Barras</button>
        <button onClick={() => setTab('operadores')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'operadores' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Operadores</button>
        <button onClick={() => setTab('tablets')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${tab === 'tablets' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Tablets</button>
      </div>

      {tab === 'operadores' ? (
        <BarOperators />
      ) : tab === 'tablets' ? (
        <BarTablets />
      ) : (
      <>
      <PageHeader kicker="Barras" title="Barras de bebida y comida">
        <div className="flex flex-wrap items-center gap-2">
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); loadBars(e.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <option value="">Elegí un evento…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {eventId && (
            <>
              <button onClick={() => setBarModal({ event_id: eventId, name: '', location: '', status: 'active' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Nueva barra
              </button>
              <Link to="/barras-reportes" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <BarChart3 className="h-4 w-4" /> Reportes
              </Link>
            </>
          )}
        </div>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Wine className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Elegí un evento para configurar sus barras y menús.</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="space-y-4">
          <EventMenu event={events.find((e) => e.id === eventId)} />
          {bars.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Sin barras. Creá la primera.</div>}
          {bars.map((b) => (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Wine className="h-5 w-5" /></span>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">{b.name} {b.status === 'inactive' && <span className="ml-1 text-xs text-slate-400">(inactiva)</span>}</p>
                  <p className="text-xs text-slate-500">{b.sectors?.length ? b.sectors.map((s) => s.label).join(' · ') : 'Sin sector'}</p>
                </div>
                <Link to={`/barras/${b.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">
                  <ExternalLink className="h-4 w-4" /> Abrir POS
                </Link>
                <button onClick={() => setPosBar(posBar === b.id ? null : b.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${posBar === b.id ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <Cpu className="h-4 w-4" /> POS
                </button>
                <button onClick={() => setBarModal(b)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => deleteBar(b)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
              {posBar === b.id && (
                <div className="border-t border-slate-100 p-4">
                  <BarPosDevices bar={b} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {barModal && <BarFormModal bar={barModal} sectors={events.find((e) => e.id === eventId)?.bar_sectors || []} onClose={() => setBarModal(null)} onSave={saveBar} />}
      </>
      )}
    </div>
  );
}