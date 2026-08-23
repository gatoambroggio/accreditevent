import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Pencil, Ticket as TicketIcon, Download, Save, Store, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/page-header';

const API_BASE = (import.meta.env?.VITE_API_URL) || '/api';
const fmtCur = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const toLocalInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

export default function TicketSales() {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [event, setEvent] = useState(null);
  const [sale, setSale] = useState(null);
  const [types, setTypes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSale, setSavingSale] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [mpConfig, setMpConfig] = useState({ access_token: '', public_key: '', webhook_url: '', sandbox: false, back_url_base: '' });
  const [savingMp, setSavingMp] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const evs = await base44.entities.Event.list('-start_at', 200);
        setEvents(evs);
        // MP config desde SystemSetting
        const s = await base44.entities.SystemSetting.list('-created_date', 1);
        if (s[0]?.mercadopago) setMpConfig({ access_token: '', public_key: '', webhook_url: '', sandbox: false, back_url_base: '', ...(s[0].mercadopago || {}) });
      } catch {}
      setLoading(false);
    })();
  }, []);

  const loadEvent = useCallback(async (id) => {
    if (!id) { setEvent(null); setSale(null); setTypes([]); setStats(null); setTickets([]); return; }
    setLoading(true);
    try {
      const ev = events.find((e) => e.id === id) || await base44.entities.Event.get(id);
      setEvent(ev);
      const [sales, tps] = await Promise.all([
        base44.entities.TicketSale.filter({ event_id: id }, '-created_date', 5),
        base44.entities.TicketType.filter({ event_id: id }, 'sort_order', 100),
      ]);
      setSale(sales[0] || { event_id: id, event_name: ev.name, company: ev.company, enabled: false, open_at: '', close_at: '', description: '', address: '', terms: '', image_url: '' });
      setTypes(tps);
      await refreshStats(id);
      await refreshTickets(id, 'all');
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setLoading(false);
  }, [events, toast]);

  const refreshStats = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/tickets-stats/stats?event_id=${id}`);
      const data = await res.json();
      setStats(data);
    } catch {}
  };

  const refreshTickets = async (id, status) => {
    try {
      const where = { event_id: id };
      if (status && status !== 'all') where.status = status;
      const list = await base44.entities.Ticket.filter(where, '-created_date', 100);
      setTickets(list);
    } catch {}
  };

  const saveSale = async () => {
    setSavingSale(true);
    try {
      const payload = { ...sale, event_id: eventId, event_name: event?.name, company: event?.company };
      const clean = {};
      for (const [k, v] of Object.entries(payload)) {
        if (['open_at', 'close_at', 'description', 'address', 'terms', 'image_url'].includes(k)) {
          clean[k] = v === '' || v == null ? null : v;
        } else {
          clean[k] = v;
        }
      }
      if (sale.id) {
        await base44.entities.TicketSale.update(sale.id, clean);
      } else {
        await base44.entities.TicketSale.create(clean);
      }
      toast({ title: 'Venta actualizada', description: 'La configuración de la venta se guardó.' });
      await loadEvent(eventId);
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setSavingSale(false);
  };

  const saveType = async (t) => {
    try {
      const clean = { ...t, event_id: eventId, event_name: event?.name, company: event?.company, price: Number(t.price), capacity: Number(t.capacity), limit_per_purchase: Number(t.limit_per_purchase || 10), sort_order: Number(t.sort_order || 0) };
      if (t.id) await base44.entities.TicketType.update(t.id, clean);
      else await base44.entities.TicketType.create(clean);
      setEditingType(null);
      await loadEvent(eventId);
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const deleteType = async (t) => {
    if (!confirm(`¿Eliminar el tipo de entrada "${t.name}"?`)) return;
    try { await base44.entities.TicketType.delete(t.id); await loadEvent(eventId); } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const saveMp = async () => {
    setSavingMp(true);
    try {
      // PUT /settings crea o actualiza el singleton de SystemSetting (no hay POST).
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ae_access_token') || ''}` },
        body: JSON.stringify({ mercadopago: mpConfig }),
      });
      if (!res.ok) throw new Error('No se pudo guardar la configuración.');
      toast({ title: 'Mercado Pago', description: 'Configuración guardada.' });
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    setSavingMp(false);
  };

  const exportCsv = () => {
    window.open(`${API_BASE}/tickets-stats/export?event_id=${eventId}`, '_blank');
  };

  if (loading && !event) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader kicker="Ticketera" title="Venta de entradas">
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); loadEvent(e.target.value); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="">Elegí un evento…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </PageHeader>

      {!eventId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">Elegí un evento para configurar y monitorear la venta de entradas.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Configuración de la venta */}
          <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">Publicación de la venta</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:col-span-2">
                <input type="checkbox" checked={!!sale?.enabled} onChange={(e) => setSale({ ...sale, enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                <span className="text-sm font-semibold text-slate-700">Venta publicada (visible en la tienda pública)</span>
              </label>
              <Field label="Apertura de venta">
                <input type="datetime-local" value={toLocalInput(sale?.open_at)} onChange={(e) => setSale({ ...sale, open_at: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Cierre de venta">
                <input type="datetime-local" value={toLocalInput(sale?.close_at)} onChange={(e) => setSale({ ...sale, close_at: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Descripción (tienda)">
                <textarea value={sale?.description || ''} onChange={(e) => setSale({ ...sale, description: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Dirección / Sede">
                <input value={sale?.address || ''} onChange={(e) => setSale({ ...sale, address: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="URL de imagen">
                <input value={sale?.image_url || ''} onChange={(e) => setSale({ ...sale, image_url: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Términos y condiciones">
                <textarea value={sale?.terms || ''} onChange={(e) => setSale({ ...sale, terms: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
            </div>
            <button onClick={saveSale} disabled={savingSale} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              <Save className="h-4 w-4" /> {savingSale ? 'Guardando…' : 'Guardar venta'}
            </button>
          </section>

          {/* Stats */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">Resumen</h3>
            </div>
            {stats ? (
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Ingresos" value={fmtCur(stats.revenue)} strong />
                <Row label="Entradas vendidas" value={stats.sold_count} />
                <Row label="Pagadas" value={stats.counts?.paid} />
                <Row label="Pendientes" value={stats.counts?.pending} />
                <Row label="Usadas" value={stats.counts?.used} />
                <Row label="Reembolsadas" value={stats.counts?.refunded} />
                <Row label="Canceladas" value={stats.counts?.cancelled} />
                <button onClick={exportCsv} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Exportar CSV
                </button>
              </div>
            ) : <p className="mt-3 text-sm text-slate-400">Sin datos.</p>}
          </section>

          {/* Tipos de entrada */}
          <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TicketIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Tipos de entrada</h3>
              </div>
              <button onClick={() => setEditingType({ name: '', price: 0, capacity: 0, limit_per_purchase: 10, status: 'active', sort_order: types.length, description: '' })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Nuevo
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {types.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-bold text-slate-900">{t.name} {t.status === 'inactive' && <span className="ml-1 text-xs text-slate-400">(inactivo)</span>}</p>
                    <p className="text-xs text-slate-500">{fmtCur(t.price)} · vendidas {t.sold}/{t.capacity} · máx. {t.limit_per_purchase}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingType(t)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deleteType(t)} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              {types.length === 0 && <p className="text-sm text-slate-400">Aún no hay tipos de entrada. Creá el primero.</p>}
            </div>
            {editingType && (
              <TypeEditor type={editingType} onClose={() => setEditingType(null)} onSave={saveType} />
            )}
          </section>

          {/* MP config */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold text-slate-900">Mercado Pago</h3>
            <div className="mt-3 space-y-3">
              <Field label="Access Token">
                <input type="password" value={mpConfig.access_token} onChange={(e) => setMpConfig({ ...mpConfig, access_token: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
              </Field>
              <Field label="Public Key">
                <input value={mpConfig.public_key} onChange={(e) => setMpConfig({ ...mpConfig, public_key: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
              </Field>
              <Field label="Webhook URL (notificación)">
                <input value={mpConfig.webhook_url} onChange={(e) => setMpConfig({ ...mpConfig, webhook_url: e.target.value })} placeholder="https://TU-DOMINIO/api/webhooks/mercadopago" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Base de back-urls (opcional)">
                <input value={mpConfig.back_url_base} onChange={(e) => setMpConfig({ ...mpConfig, back_url_base: e.target.value })} placeholder="https://TU-DOMINIO" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!mpConfig.sandbox} onChange={(e) => setMpConfig({ ...mpConfig, sandbox: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                <span className="text-sm text-slate-700">Modo sandbox (pruebas)</span>
              </label>
              <button onClick={saveMp} disabled={savingMp} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                <Save className="h-4 w-4" /> {savingMp ? 'Guardando…' : 'Guardar credenciales'}
              </button>
            </div>
          </section>

          {/* Últimas entradas vendidas */}
          <section className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Entradas</h3>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); refreshTickets(eventId, e.target.value); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <option value="all">Todas</option>
                <option value="paid">Pagadas</option>
                <option value="pending">Pendientes</option>
                <option value="used">Usadas</option>
                <option value="refunded">Reembolsadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-400">
                    <th className="py-2 pr-3">QR</th><th className="py-2 pr-3">Comprador</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3">Cant.</th><th className="py-2 pr-3">Total</th><th className="py-2 pr-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{t.qr_code}</td>
                      <td className="py-2 pr-3 font-semibold text-slate-800">{t.buyer_name}</td>
                      <td className="py-2 pr-3 text-slate-600">{t.ticket_type_name}</td>
                      <td className="py-2 pr-3 text-slate-600">{t.quantity}</td>
                      <td className="py-2 pr-3 text-slate-600">{fmtCur(t.total)}</td>
                      <td className="py-2 pr-3"><StatusPill status={t.status} /></td>
                    </tr>
                  ))}
                  {tickets.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Sin entradas para este filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>{children}</div>;
}
function Row({ label, value, strong }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className={strong ? 'text-lg font-extrabold text-emerald-700' : 'font-semibold text-slate-800'}>{value}</span></div>;
}
function StatusPill({ status }) {
  const map = { paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200', pending: 'bg-amber-50 text-amber-700 ring-amber-200', used: 'bg-slate-100 text-slate-600 ring-slate-200', refunded: 'bg-blue-50 text-blue-700 ring-blue-200', cancelled: 'bg-red-50 text-red-700 ring-red-200' };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${map[status] || 'bg-slate-50 text-slate-500'}`}>{status}</span>;
}

function TypeEditor({ type, onClose, onSave }) {
  const [t, setT] = useState(type);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-bold text-slate-900">{type.id ? 'Editar tipo' : 'Nuevo tipo de entrada'}</h4>
        <div className="mt-3 space-y-3">
          <Field label="Nombre"><input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
          <Field label="Descripción"><input value={t.description || ''} onChange={(e) => setT({ ...t, description: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio (ARS)"><input type="number" value={t.price} onChange={(e) => setT({ ...t, price: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
            <Field label="Capacidad"><input type="number" value={t.capacity} onChange={(e) => setT({ ...t, capacity: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
            <Field label="Máx. por compra"><input type="number" value={t.limit_per_purchase} onChange={(e) => setT({ ...t, limit_per_purchase: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
            <Field label="Estado">
              <select value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="active">Activo</option><option value="inactive">Inactivo</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => onSave(t)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Guardar</button>
        </div>
      </div>
    </div>
  );
}