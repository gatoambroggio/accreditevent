import React, { useState } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import { slugify } from '@/lib/slugify';

const FIELDS = [
  { name: 'label', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej: Backstage' },
  { name: 'badge_prefix', label: 'Prefijo de credencial', type: 'text', placeholder: 'PR', hint: '2-3 letras para generar códigos de credencial.' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
];

export default function AccessLevels() {
  const { items, loading, create, update, remove } = useCrud('AccessLevel');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleSubmit = async (data) => {
    const slug = slugify(data.label);
    const prefix = (data.badge_prefix || '').toUpperCase().slice(0, 3);
    const enriched = { ...data, value: slug, badge_prefix: prefix };
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Gestión de accesos</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Niveles de acceso</h1>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo nivel
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay niveles de acceso configurados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nombre</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Identificador</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Prefijo</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Descripción</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{item.label}</td>
                    <td className="px-4 py-3.5"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{item.value}</code></td>
                    <td className="px-4 py-3.5"><code className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">{item.badge_prefix || '—'}</code></td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{item.description || '—'}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => openEdit(item)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
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
        title={editing ? 'Editar nivel de acceso' : 'Nuevo nivel de acceso'}
        kicker={editing ? 'EDITAR NIVEL' : 'CREAR NIVEL'}
        fields={FIELDS}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear nivel'}
      />
    </div>
  );
}