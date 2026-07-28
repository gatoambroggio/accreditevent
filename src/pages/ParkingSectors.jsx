import React from 'react';
import { Plus, Pencil, SquareParking } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import EntityModal from '@/components/EntityModal';
import { useCrud } from '@/lib/crud';

const FIELDS = [
  { name: 'value', label: 'Identificador (slug)', required: true },
  { name: 'label', label: 'Nombre visible', required: true },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
];

export default function ParkingSectors() {
  const { items: sectors, loading, create, update, remove } = useCrud('ParkingSector');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Configuración" title="Sectores de estacionamiento">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo sector
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? <p className="text-sm text-slate-400">Cargando…</p> : (
          sectors.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                  <SquareParking className="h-5 w-5" />
                </div>
                <button onClick={() => { setEditing(s); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 font-bold text-slate-900">{s.label}</p>
              <p className="text-xs text-slate-400">/{s.value}</p>
              {s.description && <p className="mt-2 text-xs text-slate-500">{s.description}</p>}
            </div>
          ))
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.label : 'Nuevo sector'}
        kicker={editing ? 'EDITAR SECTOR' : 'CREAR SECTOR'}
        fields={FIELDS}
        initialData={editing || {}}
        onSubmit={async (data) => { editing ? await update(editing.id, data) : await create(data); }}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar' : 'Crear'}
      />
    </div>
  );
}