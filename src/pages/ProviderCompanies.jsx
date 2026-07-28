import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Briefcase, Mail, Phone } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import EntityModal from '@/components/EntityModal';
import { useCrud } from '@/lib/crud';

const FIELDS = [
  { name: 'name', label: 'Nombre de la empresa', required: true, full: true },
  { name: 'description', label: 'Rubro / Descripción', type: 'textarea', full: true },
  { name: 'logo_url', label: 'Logo', type: 'image-upload', full: true },
  { name: 'contact_phone', label: 'Teléfono de contacto', type: 'phone-ar' },
  { name: 'contact_email', label: 'Email de contacto', type: 'email' },
];

export default function ProviderCompanies() {
  const { items: companies, loading, error, create, update, remove } = useCrud('ProviderCompany');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [companies, search]);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Empresas proveedoras">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </PageHeader>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o rubro…" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? <p className="text-sm text-slate-400">Cargando…</p> : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No hay empresas proveedoras.</p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <Briefcase className="h-5 w-5" />
                  </div>
                )}
                <button onClick={() => { setEditing(c); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 font-bold text-slate-900">{c.name}</p>
              {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
              <div className="mt-3 space-y-1">
                {c.contact_phone && <p className="flex items-center gap-1 text-xs text-slate-400"><Phone className="h-3 w-3" /> {c.contact_phone}</p>}
                {c.contact_email && <p className="flex items-center gap-1 text-xs text-slate-400"><Mail className="h-3 w-3" /> {c.contact_email}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.name : 'Nueva empresa proveedora'}
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