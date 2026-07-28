import React from 'react';
import { Plus, Pencil, Building2 } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import EntityModal from '@/components/EntityModal';
import { useCrud } from '@/lib/crud';

const FIELDS = [
  { name: 'name', label: 'Nombre de la empresa', required: true, full: true },
  { name: 'slug', label: 'Identificador URL', hint: 'Se genera automáticamente si se deja vacío' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
  { name: 'logo_url', label: 'Logo', type: 'image-upload', full: true },
];

export default function Companies() {
  const { items: companies, loading, create, update, remove } = useCrud('Company');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Empresas">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? <p className="text-sm text-slate-400">Cargando…</p> : (
          companies.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Building2 className="h-5 w-5" />
                  </div>
                )}
                <button onClick={() => { setEditing(c); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 font-bold text-slate-900">{c.name}</p>
              {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
            </div>
          ))
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.name : 'Nueva empresa'}
        kicker={editing ? 'EDITAR EMPRESA' : 'CREAR EMPRESA'}
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