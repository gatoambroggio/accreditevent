import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, Loader2, Mail, MessageCircle, Search, Users, Filter, CheckSquare } from 'lucide-react';

const PERSON_TYPES = [
  { value: 'provider', label: 'Proveedores' },
  { value: 'technician', label: 'Técnicos' },
  { value: 'staff', label: 'Staff' },
  { value: 'press', label: 'Prensa' },
  { value: 'artist', label: 'Artistas' },
  { value: 'guest', label: 'Invitados' },
];

export default function Messages() {
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [mode, setMode] = useState('event');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includePickup, setIncludePickup] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [evs, ps, accs] = await Promise.all([
          base44.entities.Event.list('-created_date', 500),
          base44.entities.Person.list('-created_date', 500),
          base44.entities.Accreditation.list('-created_date', 500),
        ]);
        setEvents(evs);
        setPeople(ps);
        setAccreditations(accs);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const eventPersonIds = useMemo(() => {
    if (!selectedEventId) return [];
    return accreditations
      .filter((a) => a.event_id === selectedEventId && a.status === 'active')
      .map((a) => a.person_id);
  }, [accreditations, selectedEventId]);

  const eventPeople = useMemo(() =>
    people.filter((p) => eventPersonIds.includes(p.id)),
  [people, eventPersonIds]);

  const recipients = useMemo(() => {
    if (mode === 'event') return eventPeople;
    if (mode === 'group') return eventPeople.filter((p) => selectedGroups.includes(p.person_type));
    if (mode === 'manual') return eventPeople.filter((p) => selectedPersonIds.includes(p.id));
    return [];
  }, [mode, eventPeople, selectedGroups, selectedPersonIds]);

  const filteredManualPeople = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return eventPeople;
    return eventPeople.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [eventPeople, search]);

  const toggleGroup = (type) =>
    setSelectedGroups((g) => (g.includes(type) ? g.filter((t) => t !== type) : [...g, type]));

  const togglePerson = (id) =>
    setSelectedPersonIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const buildPickupInfo = () => {
    if (!selectedEvent || !includePickup) return null;
    const mapsUrl = selectedEvent.pickup_lat && selectedEvent.pickup_lng
      ? `https://www.google.com/maps?q=${selectedEvent.pickup_lat},${selectedEvent.pickup_lng}`
      : null;
    const date = selectedEvent.pickup_date
      ? new Date(selectedEvent.pickup_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const time = selectedEvent.pickup_start_time && selectedEvent.pickup_end_time
      ? `${selectedEvent.pickup_start_time} a ${selectedEvent.pickup_end_time} hs`
      : null;
    return { date, time, mapsUrl };
  };

  const buildEmailHtml = (personName) => {
    const pickup = buildPickupInfo();
    const bodyHtml = body.replace(/\n/g, '<br>');
    let pickupHtml = '';
    if (pickup && (pickup.date || pickup.time || pickup.mapsUrl)) {
      pickupHtml = `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-top:24px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 12px;color:#047857;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Datos de retiro</p>`;
      if (pickup.date) pickupHtml += `<p style="margin:0 0 8px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">📅 Fecha</p><p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:700;">${pickup.date}</p>`;
      if (pickup.time) pickupHtml += `<p style="margin:0 0 8px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">🕐 Horario</p><p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:700;">${pickup.time}</p>`;
      if (pickup.mapsUrl) pickupHtml += `<a href="${pickup.mapsUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;">🗺️ Ver ubicación en Google Maps</a>`;
      pickupHtml += `</td></tr></table>`;
    }
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f0fdf4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#047857,#065f46);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">AccreditEvent</h1>
<p style="margin:8px 0 0;color:#a7f3d0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">${selectedEvent?.name || ''}</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="margin:0 0 20px;color:#0f172a;font-size:16px;line-height:1.6;">Hola <strong>${personName}</strong>,</p>
<div style="color:#475569;font-size:15px;line-height:1.6;">${bodyHtml}</div>
${pickupHtml}
</td></tr>
<tr><td style="background-color:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">AccreditEvent · Sistema de acreditación de eventos</p>
</td></tr>
</table>
</td></tr>
</table></body></html>`;
  };

  const buildWhatsAppMessage = (personName) => {
    const pickup = buildPickupInfo();
    let msg = `Hola ${personName},\n\n${body}`;
    if (pickup) {
      msg += '\n\n';
      if (pickup.date) msg += `📅 ${pickup.date}\n`;
      if (pickup.time) msg += `🕐 ${pickup.time}\n`;
      if (pickup.mapsUrl) msg += `🗺️ ${pickup.mapsUrl}`;
    }
    msg += '\n\nAccreditEvent';
    return msg;
  };

  const handleSend = async () => {
    setSending(true);
    setSendResults(null);
    const emailsSent = [];
    const waLinks = [];
    for (const person of recipients) {
      if (person.email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: person.email,
            subject: subject || 'Mensaje de AccreditEvent',
            body: buildEmailHtml(person.full_name),
          });
          emailsSent.push(person.email);
        } catch {}
      }
      if (person.phone) {
        let cleanPhone = person.phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('54')) {
          cleanPhone = '54' + cleanPhone.replace(/^0/, '');
        }
        const waMessage = encodeURIComponent(buildWhatsAppMessage(person.full_name));
        waLinks.push({ name: person.full_name, link: `https://wa.me/${cleanPhone}?text=${waMessage}` });
      }
    }
    setSendResults({ emailsSent: emailsSent.length, total: recipients.length, waLinks });
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Comunicación</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Mensajes</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Evento</label>
        <select
          value={selectedEventId}
          onChange={(e) => { setSelectedEventId(e.target.value); setSelectedGroups([]); setSelectedPersonIds([]); setSendResults(null); }}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Seleccionar evento…</option>
          {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
        </select>
      </div>

      {selectedEventId && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold text-slate-600">Destinatarios</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { value: 'event', label: 'Todos del evento', icon: Users },
                { value: 'group', label: 'Por grupo', icon: Filter },
                { value: 'manual', label: 'Manual', icon: CheckSquare },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      mode === m.value ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {m.label}
                  </button>
                );
              })}
            </div>

            {mode === 'group' && (
              <div className="flex flex-wrap gap-2">
                {PERSON_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => toggleGroup(t.value)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      selectedGroups.includes(t.value)
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {mode === 'manual' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar persona…"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {filteredManualPeople.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedPersonIds.includes(p.id)}
                        onChange={() => togglePerson(p.id)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                        <p className="text-xs text-slate-400">
                          {p.person_type} · {p.email || 'sin email'} · {p.phone || 'sin teléfono'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-700">{recipients.length}</span>
              <span className="text-sm text-slate-400">persona(s) seleccionada(s)</span>
              <span className="ml-auto text-xs text-slate-400">
                {recipients.filter((r) => r.email).length} con email · {recipients.filter((r) => r.phone).length} con WhatsApp
              </span>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-600">Mensaje</p>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Asunto (email)</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto del mensaje…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Cuerpo del mensaje</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Escribí el mensaje…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {selectedEvent?.pickup_date && (
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={includePickup}
                  onChange={(e) => setIncludePickup(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-slate-700">Incluir datos de retiro del evento (fecha, horario y ubicación)</span>
              </label>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={sending || recipients.length === 0 || !body.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enviando…' : `Enviar a ${recipients.length} persona(s)`}
          </button>

          {sendResults && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <Mail className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">
                  {sendResults.emailsSent} email(s) enviados
                </p>
              </div>
              {sendResults.waLinks.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm font-semibold text-slate-700">
                      WhatsApp — abrí cada chat para enviar
                    </p>
                  </div>
                  <div className="space-y-2">
                    {sendResults.waLinks.map((wa, i) => (
                      <a
                        key={i}
                        href={wa.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
                      >
                        <span className="text-sm font-medium text-slate-900">{wa.name}</span>
                        <span className="text-xs font-medium text-emerald-600">Abrir chat →</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}