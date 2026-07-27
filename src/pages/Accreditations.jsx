import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Loader2, Fingerprint, Printer, Search, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import BiometricButton from '@/components/BiometricButton';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import BadgePrint from '@/components/BadgePrint';
import { useZones } from '@/lib/useZones';
import { usePersonTypes } from '@/lib/usePersonTypes';
import { generateBadgeCode } from '@/lib/badgeCode';

export default function Accreditations() {
  const { items, loading, create, update, remove, reload } = useCrud('Accreditation');
  const { zones } = useZones();
  const { personTypes } = usePersonTypes();
  const typePrefixes = useMemo(() => {
    const map = {};
    personTypes.forEach((t) => { map[t.value] = t.badge_prefix || 'GE'; });
    return map;
  }, [personTypes]);
  const accessLevels = zones.map((z) => z.value);
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [badgeAccred, setBadgeAccred] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [evs, ps] = await Promise.all([
          base44.entities.Event.list('-created_date', 500),
          base44.entities.Person.list('-created_date', 500),
        ]);
        setEvents(evs);
        setPeople(ps);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (eventFilter) result = result.filter((a) => a.event_id === eventFilter);
    if (statusFilter) result = result.filter((a) => a.status === statusFilter);
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((a) =>
        `${a.person_name} ${a.badge_code} ${a.person_type}`.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, eventFilter, statusFilter, query]);

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Evento', 'Código', 'Área', 'Nivel de acceso', 'Estado', 'Biometría'],
      filtered.map((a) => [
        a.person_name || '',
        a.person_type || '',
        a.event_name || '',
        a.badge_code || '',
        a.area || '',
        a.access_level || '',
        a.status || '',
        a.has_biometric ? 'Sí' : 'No',
      ]),
      'acreditaciones'
    );
  };

  const eventOptions = events.map((e) => ({ value: e.id, label: e.name }));
  const personOptions = people.map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` }));

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true },
    ...(editing ? [{ name: 'badge_code', label: 'Código de credencial', type: 'text', required: true }] : []),
    { name: 'area', label: 'Área', type: 'text' },
    {
      name: 'access_level', label: 'Nivel de acceso', type: 'select',
      options: accessLevels.map((l) => ({ value: l, label: l })),
    },
    {
      name: 'status', label: 'Estado', type: 'select',
      options: [
        { value: 'active', label: 'Activa' },
        { value: 'blocked', label: 'Bloqueada' },
        { value: 'revoked', label: 'Revocada' },
      ],
    },
    { name: 'has_biometric', label: 'Biometría registrada', type: 'checkbox' },
  ];

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleFieldChange = async (name, value, setField) => {
    if (name === 'person_id' && value) {
      try {
        const bios = await base44.entities.Biometric.filter({ person_id: value, status: 'active' }, '-created_date', 1);
        setField('has_biometric', bios.length > 0);
      } catch {}
    }
  };

  const handleSubmit = async (data) => {
    // Prevent duplicate: one credential per person per event (server-side check)
    const existing = await base44.entities.Accreditation.filter(
      { event_id: data.event_id, person_id: data.person_id },
      '-created_date',
      5
    );
    if (existing.some((a) => !editing || a.id !== editing.id)) {
      throw new Error('Esta persona ya tiene una credencial registrada para este evento.');
    }
    // Block assignment if the person has pending/rejected/expired documentation
    if (!editing) {
      const res = await base44.functions.invoke('checkPersonDocuments', { person_id: data.person_id });
      if (res.data?.has_pending) {
        throw new Error(`No se puede asignar: la persona tiene documentación pendiente de aprobación (${res.data.pending_statuses.join(', ')}).`);
      }
    }
    // Denormalize event/person data
    const evt = events.find((e) => e.id === data.event_id);
    const person = people.find((p) => p.id === data.person_id);
    const enriched = {
      ...data,
      event_name: evt?.name || '',
      person_name: person?.full_name || '',
      person_type: person?.person_type || '',
      person_email: person?.email || '',
    };
    if (!editing) {
      enriched.badge_code = generateBadgeCode(person?.person_type, items.map((a) => a.badge_code), typePrefixes);
    }
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
      // Send pickup notifications (email + WhatsApp)
      if (evt?.pickup_address) {
        const mapsUrl = evt.pickup_lat && evt.pickup_lng
          ? `https://www.google.com/maps?q=${evt.pickup_lat},${evt.pickup_lng}`
          : `https://www.google.com/maps?q=${encodeURIComponent(evt.pickup_address)}`;
        const pickupDate = evt.pickup_date
          ? new Date(evt.pickup_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'a confirmar';
        const pickupTime = evt.pickup_start_time && evt.pickup_end_time
          ? `${evt.pickup_start_time} a ${evt.pickup_end_time} hs`
          : (evt.pickup_start_time || 'a confirmar');

        // Email (only reaches registered app users)
        if (person?.email) {
          try {
            const htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f0fdf4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#047857,#065f46);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">AccreditEvent</h1>
<p style="margin:8px 0 0;color:#a7f3d0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Tu acreditación está lista</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="margin:0 0 20px;color:#0f172a;font-size:16px;line-height:1.6;">Hola <strong>${person.full_name}</strong>,</p>
<p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.6;">Tu acreditación para <strong style="color:#047857;">${evt.name}</strong> ya está lista. Estos son los datos para el retiro:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:28px;">
<tr><td style="padding:24px;">
<p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">📅 Fecha de retiro</p>
<p style="margin:0 0 20px;color:#0f172a;font-size:15px;font-weight:700;">${pickupDate}</p>
<p style="margin:0 0 6px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">🕐 Horario</p>
<p style="margin:0;color:#0f172a;font-size:15px;font-weight:700;">${pickupTime}</p>
</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="${mapsUrl}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">🗺️ Ver ubicación en Google Maps</a>
</td></tr></table>
<p style="margin:28px 0 0;color:#475569;font-size:14px;line-height:1.6;">¡Te esperamos!</p>
</td></tr>
<tr><td style="background-color:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">AccreditEvent · Sistema de acreditación de eventos</p>
</td></tr>
</table>
</td></tr>
</table></body></html>`;
            await base44.integrations.Core.SendEmail({
              to: person.email,
              subject: `Tu acreditación para ${evt.name} está lista`,
              body: htmlBody,
            });
          } catch {}
        }

        // WhatsApp (opens chat with pre-filled message)
        if (person?.phone) {
          let cleanPhone = person.phone.replace(/\D/g, '');
          if (!cleanPhone.startsWith('54')) {
            cleanPhone = '54' + cleanPhone.replace(/^0/, '');
          }
          const waMessage = encodeURIComponent(
            `Hola ${person.full_name},\n\n` +
            `Tu acreditación para "${evt.name}" ya está lista.\n\n` +
            `Podés retirarla el día ${pickupDate}, en el horario de ${pickupTime}.\n\n` +
            `Ver ubicación en el mapa: ${mapsUrl}\n\n` +
            `Te esperamos.\n\nAccreditEvent`
          );
          const waLink = document.createElement('a');
          waLink.href = `https://wa.me/${cleanPhone}?text=${waMessage}`;
          waLink.target = '_blank';
          waLink.rel = 'noopener noreferrer';
          document.body.appendChild(waLink);
          waLink.click();
          document.body.removeChild(waLink);
        }
      }
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Control de accesos</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Acreditaciones</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> Nueva acreditación
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por persona, código o tipo…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los eventos</option>
          {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activa</option>
          <option value="blocked">Bloqueada</option>
          <option value="revoked">Revocada</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay acreditaciones registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Evento</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Código</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Área / Nivel</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Bio</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-slate-900">{a.person_name || '—'}</p>
                      <p className="text-xs text-slate-400">{a.person_type}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{a.event_name || '—'}</td>
                    <td className="px-4 py-3.5"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{a.badge_code}</code></td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{a.area || '—'} / {a.access_level}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3.5">
                      <BiometricButton accreditation={a} onRegistered={reload} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setBadgeAccred(a)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" title="Imprimir credencial">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(a)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar acreditación' : 'Nueva acreditación'}
        kicker={editing ? 'EDITAR ACREDITACIÓN' : 'CREAR ACREDITACIÓN'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear acreditación'}
        onFieldChange={handleFieldChange}
      />

      {badgeAccred && (
        <BadgePrint
          accreditation={badgeAccred}
          event={events.find((e) => e.id === badgeAccred.event_id)}
          onClose={() => setBadgeAccred(null)}
        />
      )}
    </div>
  );
}