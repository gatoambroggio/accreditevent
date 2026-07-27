import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Search, Loader2, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import { base44 } from '@/api/base44Client';
import { usePersonTypes } from '@/lib/usePersonTypes';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import PersonDetailModal from '@/components/PersonDetailModal';

const validatePerson = (data) => {
  const e = {};
  if (!data.full_name?.trim()) e.full_name = 'El nombre es obligatorio';
  if (!data.person_type) e.person_type = 'Seleccioná un tipo';
  if (!data.document?.trim()) e.document = 'El documento es obligatorio';
  else if (!/^\d{7,8}$/.test(data.document.trim())) e.document = 'Debe tener 7 u 8 dígitos numéricos';
  if (!data.company?.trim()) e.company = 'La empresa es obligatoria';
  if (!data.phone?.trim()) e.phone = 'El teléfono es obligatorio';
  else if (data.phone.replace(/\D/g, '').length < 12) e.phone = 'Teléfono incompleto (código de área + número)';
  if (!data.email?.trim()) e.email = 'El email es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email inválido';
  if (!data.status) e.status = 'Seleccioná un estado';
  return e;
};

export default function People() {
  const { items, loading, create, update, remove } = useCrud('Person');
  const { personTypes } = usePersonTypes();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailPerson, setDetailPerson] = useState(null);
  const [events, setEvents] = useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Event.list('-start_at', 200);
        setEvents(data);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((p) =>
        `${p.full_name} ${p.company || ''} ${p.document || ''}`.toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter((p) => p.person_type === typeFilter);
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    return result;
  }, [items, query, typeFilter, statusFilter]);

  const handleExport = () => {
    exportToExcel(
      ['Nombre', 'Tipo', 'Documento', 'Empresa', 'Teléfono', 'Email', 'Estado', 'Notas'],
      filtered.map((p) => [
        p.full_name || '',
        personTypes.find((t) => t.value === p.person_type)?.label || p.person_type || '',
        p.document || '',
        p.company || '',
        p.phone || '',
        p.email || '',
        p.status || '',
        p.notes || '',
      ]),
      'personas'
    );
  };

  const fields = useMemo(() => [
    { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, full: true, placeholder: 'Ej: Juan Pérez' },
    {
      name: 'event_id', label: 'Evento', type: 'select', required: true,
      options: events.map((e) => ({ value: e.id, label: e.name })),
    },
    {
      name: 'person_type', label: 'Tipo', type: 'select', required: true,
      options: personTypes.map((t) => ({ value: t.value, label: t.label })),
    },
    { name: 'document', label: 'Documento', type: 'dni', required: true, placeholder: 'Ej: 12345678' },
    { name: 'company', label: 'Empresa', type: 'text', required: true, placeholder: 'Ej: Producciones S.A.' },
    { name: 'phone', label: 'Teléfono', type: 'phone-ar', required: true, hint: 'Código de área sin 0 y número sin 15. Ej: 11 12345678' },
    { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'Ej: juan@empresa.com' },
    {
      name: 'status', label: 'Estado', type: 'select', required: true,
      options: [
        { value: 'active', label: 'Activo' },
        { value: 'inactive', label: 'Inactivo' },
        { value: 'pending', label: 'Pendiente' },
      ],
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Responsable de montaje audiovisual' },
    { name: '_face', label: 'Registro facial', type: 'face-capture', full: true },
  ], [personTypes, events]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (item) => {
    setEditing(item);
    setModalOpen(true);
    try {
      const bios = await base44.entities.Biometric.filter({ person_id: item.id, status: 'active' }, '-created_date', 1);
      if (bios[0]?.face_photo_url) {
        setEditing({ ...item, face_photo_url: bios[0].face_photo_url });
      }
    } catch {}
  };
  const handleSubmit = async (data) => {
    const { face_photo_url, face_descriptor, ...personData } = data;
    let personId;
    if (editing) {
      await update(editing.id, personData);
      personId = editing.id;
    } else {
      const created = await create(personData);
      personId = created.id;
    }
    if (face_photo_url && face_descriptor?.length) {
      const existing = await base44.entities.Biometric.filter({ person_id: personId, status: 'active' });
      for (const b of existing) {
        await base44.entities.Biometric.update(b.id, { status: 'revoked' });
      }
      await base44.entities.Biometric.create({
        person_id: personId,
        person_name: personData.full_name,
        event_id: personData.event_id,
        face_photo_url,
        face_descriptor,
        status: 'active',
      });
    }
  };
  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Directorio</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Personas</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> Nueva persona
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, empresa o documento…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los tipos</option>
          {personTypes.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="pending">Pendiente</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{query ? 'Sin resultados para tu búsqueda.' : 'No hay personas registradas todavía.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Empresa</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Contacto</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5">
                      <button onClick={() => setDetailPerson(p)} className="text-left text-sm font-semibold text-slate-900 hover:text-emerald-600">{p.full_name}</button>
                      <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{personTypes.find((t) => t.value === p.person_type)?.label || p.person_type}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{p.company || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{p.phone || p.email || '—'}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => openEdit(p)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
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
        title={editing ? 'Editar persona' : 'Nueva persona'}
        kicker={editing ? 'EDITAR PERSONA' : 'CREAR PERSONA'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        validate={validatePerson}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear persona'}
      />

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} />
      )}
    </div>
  );
}