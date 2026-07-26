import React, { useState } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';

const FIELDS = [
  { name: 'name', label: 'Nombre del evento', type: 'text', required: true, full: true },
  { name: 'venue', label: 'Sede', type: 'text' },
  { name: 'logo_url', label: 'Logo del evento', type: 'image-upload', full: true },
  { name: 'start_at', label: 'Inicio', type: 'datetime-local' },
  { name: 'end_at', label: 'Fin', type: 'datetime-local' },
  {
    name: 'status', label: 'Estado', type: 'select',
    options: [
      { value: 'draft', label: 'Borrador' },
      { value: 'active', label: 'Activo' },
      { value: 'closed', label: 'Cerrado' },
    ],
  },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Events() {
  const { items, loading, create, update, remove } = useCrud('Event');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Gestión</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Eventos</h1>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo evento
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay eventos registrados. Creá el primero.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Evento</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Sede</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Fechas</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{e.name}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{e.venue || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">
                      {fmtDate(e.start_at)}{e.end_at ? ` — ${fmtDate(e.end_at)}` : ''}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => openEdit(e)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
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
        title={editing ? 'Editar evento' : 'Nuevo evento'}
        kicker={editing ? 'EDITAR EVENTO' : 'CREAR EVENTO'}
        fields={FIELDS}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear evento'}
      />
    </div>
  );
}