import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Printer, Download, ScanFace } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import BiometricButton from '@/components/BiometricButton';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import BadgePrint from '@/components/BadgePrint';
import BatchBadgePrint from '@/components/BatchBadgePrint';
import DniToBiometric from '@/components/DniToBiometric';
import { useZones } from '@/lib/useZones';
import { usePersonTypes } from '@/lib/usePersonTypes';
import { generateBadgeCode } from '@/lib/badgeCode';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'revoked', label: 'Revocada' },
];

export default function Accreditations() {
  const { items, loading, error, create, update, remove, reload } = useCrud('Accreditation');
  const { zones } = useZones();
  const { personTypes } = usePersonTypes();
  const typePrefixes = useMemo(() => {
    const map = {};
    personTypes.forEach((t) => { map[t.value] = t.badge_prefix || 'GE'; });
    return map;
  }, [personTypes]);
  const accessLevels = [...new Set(zones.map((z) => z.value))];
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [badgeAccred, setBadgeAccred] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [dniBioAccred, setDniBioAccred] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [evs, ps] = await Promise.all([
          base44.entities.Event.list('-created_date', 200),
          base44.entities.Person.list('-created_date', 200),
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

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((a) => a.id));
    });
  };

  const handleBatchPrint = () => {
    const selectedAccreds = filtered.filter((a) => selected.has(a.id));
    if (selectedAccreds.length === 0) return;
    setBatchOpen(true);
  };

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Evento', 'Código', 'Área de acceso', 'Estado', 'Biometría'],
      filtered.map((a) => [
        a.person_name || '',
        zones.find((z) => z.value === a.person_type)?.label || a.person_type || '',
        a.event_name || '',
        a.badge_code || '',
        zones.find((z) => z.value === (a.access_level || a.area))?.label || a.access_level || a.area || '',
        a.status || '',
        a.has_biometric ? 'Sí' : 'No',
      ]),
      'acreditaciones'
    );
  };

  const eventOptions = events
    .filter((e) => e.status !== 'closed' || (editing && editing.event_id === e.id))
    .map((e) => ({ value: e.id, label: e.name }));
  const personOptions = people.map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` }));

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true },
    ...(editing ? [{ name: 'badge_code', label: 'Código de credencial', type: 'text', required: true }] : []),
    {
      name: 'access_level', label: 'Área de acceso', type: 'select',
      options: zones.map((z) => ({ value: z.value, label: z.label })),
    },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS },
    { name: 'has_biometric', label: 'Biometría registrada', type: 'checkbox' },
  ];

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing({ ...item, access_level: item.access_level || item.area || '' }); setModalOpen(true); };

  const handleFieldChange = async (name, value, setField) => {
    if (name === 'person_id' && value) {
      try {
        const bios = await base44.entities.Biometric.filter({ person_id: value, status: 'active' }, '-created_date', 1);
        setField('has_biometric', bios.length > 0);
        const p = people.find((p) => p.id === value);
        if (p?.access_area) setField('access_level', p.access_area);
      } catch {}
    }
  };

  const handleSubmit = async (data) => {
    const existing = await base44.entities.Accreditation.filter(
      { event_id: data.event_id, person_id: data.person_id },
      '-created_date',
      5
    );
    if (existing.some((a) => !editing || a.id !== editing.id)) {
      throw new Error('Esta persona ya tiene una credencial registrada para este evento.');
    }
    if (!editing) {
      const res = await base44.functions.invoke('checkPersonDocuments', { person_id: data.person_id });
      if (res.data?.has_pending) {
        throw new Error(`No se puede asignar: la persona tiene documentación pendiente o vencida (${res.data.pending_statuses.join(', ')}).`);
      }
    }
    const evt = events.find((e) => e.id === data.event_id);
    const person = people.find((p) => p.id === data.person_id);
    const enriched = {
      ...data,
      event_name: evt?.name || '',
      company: evt?.company || '',
      person_name: person?.full_name || '',
      person_type: person?.person_type || '',
      person_email: person?.email || '',
      area: data.access_level || 'general',
      access_level: data.access_level || 'general',
    };
    if (!editing) {
      enriched.badge_code = generateBadgeCode(person?.person_type, items.map((a) => a.badge_code), typePrefixes);
    }
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
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
      <PageHeader kicker="Control de accesos" title="Acreditaciones">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={handleBatchPrint} disabled={selected.size === 0}
          className={`${btnOutline} disabled:opacity-40 disabled:cursor-not-allowed`}>
          <Printer className="h-4 w-4" /> Imprimir ({selected.size})
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nueva acreditación
        </button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por persona, código o tipo…" />
        <FilterSelect value={eventFilter} onChange={setEventFilter} options={events.map((e) => ({ value: e.id, label: e.name }))} placeholder="Todos los eventos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable loading={loading} error={error} isEmpty={filtered.length === 0} emptyMessage="No hay acreditaciones registradas." tableClassName="min-w-[800px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </Th>
            <Th>Persona</Th>
            <Th>Evento</Th>
            <Th>Código</Th>
            <Th>Área de acceso</Th>
            <Th>Estado</Th>
            <Th>Bio</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => (
            <Tr key={a.id}>
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggleSelect(a.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </Td>
              <Td>
                <p className="text-sm font-semibold text-slate-900">{a.person_name || '—'}</p>
                <p className="text-xs text-slate-400">{zones.find((z) => z.value === a.person_type)?.label || a.person_type}</p>
              </Td>
              <Td className="text-sm text-slate-500">{a.event_name || '—'}</Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{a.badge_code}</code></Td>
              <Td className="text-sm text-slate-500">{zones.find((z) => z.value === (a.access_level || a.area))?.label || a.access_level || a.area || '—'}</Td>
              <Td><StatusBadge status={a.status} /></Td>
              <Td>
                <BiometricButton accreditation={a} onRegistered={reload} />
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setBadgeAccred(a)} className={btnIcon} title="Imprimir credencial">
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDniBioAccred(a)} className={btnIcon} title="Biometría desde DNI">
                    <ScanFace className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(a)} className={btnIcon}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

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

      {batchOpen && (
        <BatchBadgePrint
          accreditations={filtered.filter((a) => selected.has(a.id))}
          events={events}
          onClose={() => setBatchOpen(false)}
        />
      )}

      {dniBioAccred && (
        <DniToBiometric
          person={{ id: dniBioAccred.person_id, full_name: dniBioAccred.person_name, company: dniBioAccred.company }}
          onSaved={reload}
          onClose={() => setDniBioAccred(null)}
        />
      )}
    </div>
  );
}