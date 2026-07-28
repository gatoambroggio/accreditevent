import React from 'react';
import { Plus, Trash2, Pencil, Layers } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import EntityModal from '@/components/EntityModal';
import { useCrud } from '@/lib/crud';

const FIELDS = [
  { name: 'value', label: 'Identificador (slug)', required: true, hint: 'Ej: backstage, vip, all-access' },
  { name: 'label', label: 'Nombre visible', required: true },
  { name: 'badge_prefix', label: 'Prefijo de credencial', hint: '2-3 letras. Ej: BA, VI, AA' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
];

export default function AccessLevels() {
  const { items: levels, loading, error, create, update, remove } = useCrud('AccessLevel');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Configuración" title="Niveles de acceso">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nuevo nivel
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : levels.length === 0 ? (
          <p className="text-sm text-slate-400">No hay niveles configurados.</p>
        ) : (
          levels.map((l) => (
            <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(l); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-3 font-bold text-slate-900">{l.label}</p>
              <p className="text-xs text-slate-400">/{l.value}</p>
              {l.badge_prefix && (
                <span className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{l.badge_prefix}</span>
              )}
              {l.description && <p className="mt-2 text-xs text-slate-500">{l.description}</p>}
            </div>
          ))
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.label : 'Nuevo nivel de acceso'}
        kicker={editing ? 'EDITAR NIVEL' : 'CREAR NIVEL'}
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