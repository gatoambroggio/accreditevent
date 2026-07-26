import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Search, Loader2 } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';

const PERSON_TYPES = ['provider', 'technician', 'staff', 'press', 'artist', 'guest'];

const FIELDS = [
  { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, full: true },
  {
    name: 'person_type', label: 'Tipo', type: 'select',
    options: PERSON_TYPES.map((t) => ({ value: t, label: t })),
  },
  { name: 'document', label: 'Documento', type: 'text' },
  { name: 'company', label: 'Empresa', type: 'text' },
  { name: 'phone', label: 'Teléfono', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
  {
    name: 'status', label: 'Estado', type: 'select',
    options: [
      { value: 'active', label: 'Activo' },
      { value: 'inactive', label: 'Inactivo' },
      { value: 'pending', label: 'Pendiente' },
    ],
  },
  { name: 'notes', label: 'Notas', type: 'textarea', full: true },
];

export default function People() {
  const { items, loading, create, update, remove } = useCrud('Person');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((p) =>
      `${p.full_name} ${p.company || ''} ${p.document || ''}`.toLowerCase().includes(q)
    );
  }, [items, query]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };
  const handleSubmit = async (data) => {
    if (editing) await update(editing.id, data);
    else await create(data);
  };
  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Directorio</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Personas</h1>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva persona
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, empresa o documento…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
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
                      <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                      <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{p.person_type}</td>
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
        fields={FIELDS}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear persona'}
      />
    </div>
  );
}