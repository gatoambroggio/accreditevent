import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Loader2, Fingerprint, Printer } from 'lucide-react';
import BiometricButton from '@/components/BiometricButton';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import BadgePrint from '@/components/BadgePrint';

const ACCESS_LEVELS = ['general', 'backstage', 'technical', 'vip', 'all-access'];

const TYPE_PREFIXES = {
  provider: 'PR',
  technician: 'TE',
  staff: 'ST',
  press: 'PS',
  artist: 'AR',
  guest: 'GU',
};

function generateBadgeCode(personType, existingCodes) {
  const prefix = TYPE_PREFIXES[personType] || 'GE';
  const nums = existingCodes
    .map((code) => (code?.startsWith(prefix) ? parseInt(code.slice(prefix.length), 10) : 0))
    .filter((n) => !isNaN(n) && n > 0);
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export default function Accreditations() {
  const { items, loading, create, update, remove, reload } = useCrud('Accreditation');
  const [events, setEvents] = useState([]);
  const [people, setPeople] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [eventFilter, setEventFilter] = useState('');
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
    if (!eventFilter) return items;
    return items.filter((a) => a.event_id === eventFilter);
  }, [items, eventFilter]);

  const eventOptions = events.map((e) => ({ value: e.id, label: e.name }));
  const personOptions = people.map((p) => ({ value: p.id, label: `${p.full_name} — ${p.document || 'sin doc'} (${p.person_type})` }));

  const fields = [
    { name: 'event_id', label: 'Evento', type: 'select', options: eventOptions, required: true },
    { name: 'person_id', label: 'Persona', type: 'searchable-select', options: personOptions, required: true, placeholder: 'Buscar por nombre o documento…', full: true },
    ...(editing ? [{ name: 'badge_code', label: 'Código de credencial', type: 'text', required: true }] : []),
    { name: 'area', label: 'Área', type: 'text' },
    {
      name: 'access_level', label: 'Nivel de acceso', type: 'select',
      options: ACCESS_LEVELS.map((l) => ({ value: l, label: l })),
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

  const handleSubmit = async (data) => {
    // Denormalize event/person data
    const evt = events.find((e) => e.id === data.event_id);
    const person = people.find((p) => p.id === data.person_id);
    const enriched = {
      ...data,
      event_name: evt?.name || '',
      person_name: person?.full_name || '',
      person_type: person?.person_type || '',
    };
    if (!editing) {
      enriched.badge_code = generateBadgeCode(person?.person_type, items.map((a) => a.badge_code));
    }
    if (editing) await update(editing.id, enriched);
    else await create(enriched);
  };

  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Control de accesos</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Acreditaciones</h1>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva acreditación
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-slate-600">Filtrar por evento</label>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los eventos</option>
          {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
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