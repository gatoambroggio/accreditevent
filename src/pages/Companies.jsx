import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Search, Building2, Copy, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { slugify } from '@/lib/slugify';
import EntityModal from '@/components/EntityModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';
import { logAudit } from '@/lib/audit';

export default function Companies() {
  const { items, loading, create, update, remove } = useCrud('Company');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.User.list('-created_date', 200);
        setUsers(data.filter((u) => u.role !== 'provider' && u.role !== 'superadmin'));
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((c) => `${c.name} ${c.slug || ''} ${c.description || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const fields = useMemo(() => [
    { name: 'name', label: 'Nombre de la empresa', type: 'text', required: true, full: true, placeholder: 'Ej: Producciones SA' },
    { name: 'slug', label: 'Identificador URL', type: 'text', placeholder: 'Se genera automáticamente', hint: 'Se usa en el link de registro: /registro/{slug}' },
    { name: 'description', label: 'Descripción', type: 'textarea', full: true, placeholder: 'Ej: Productora de eventos corporativos' },
    { name: 'logo_url', label: 'Logo', type: 'image-upload', full: true },
    {
      name: 'assigned_user_ids', label: 'Usuarios vinculados', type: 'toggle-group', full: true,
      options: users.map((u) => ({ value: u.id, label: `${u.full_name || u.email} (${u.role})` })),
    },
  ], [users]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const syncUserCompanies = async (companyName, newAssignedIds) => {
    const prevIds = editing?.assigned_user_ids || [];
    const added = newAssignedIds.filter((id) => !prevIds.includes(id));
    const removed = prevIds.filter((id) => !newAssignedIds.includes(id));
    for (const uid of [...added, ...removed]) {
      try {
        await base44.entities.User.update(uid, {
          company: added.includes(uid) ? companyName : '',
        });
      } catch {}
    }
  };

  const handleSubmit = async (data) => {
    if (!data.slug) {
      data.slug = slugify(data.name);
    }
    const assignedIds = data.assigned_user_ids
      ? String(data.assigned_user_ids).split(',').filter(Boolean)
      : [];
    const payload = { ...data, assigned_user_ids: assignedIds };
    if (editing) {
      await update(editing.id, payload);
    } else {
      await create(payload);
    }
    await syncUserCompanies(data.name, assignedIds);
    await logAudit(editing ? 'update' : 'create', 'Company', editing?.id || '', data.name);
  };

  const handleDelete = async () => { await remove(editing.id); };

  const copyLink = (company) => {
    const slug = company.slug || slugify(company.name);
    const link = `${window.location.origin}/registro/${slug}`;
    navigator.clipboard.writeText(link);
    setCopiedId(company.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Empresas">
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </PageHeader>

      <div className="max-w-md">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre…" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon={Building2}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay empresas registradas. Creá la primera.'}
        tableClassName="min-w-[720px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Empresa</Th>
            <Th>Usuarios</Th>
            <Th>Link de registro</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <Tr key={c.id}>
              <Td>
                <div className="flex items-center gap-3">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Building2 className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                    {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                  </div>
                </div>
              </Td>
              <Td>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  <Users className="h-3 w-3" /> {c.assigned_user_ids?.length || 0}
                </span>
              </Td>
              <Td>
                <button onClick={() => copyLink(c)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-600 transition hover:bg-slate-50">
                  <Copy className="h-3 w-3" />
                  {copiedId === c.id ? '¡Copiado!' : `/registro/${c.slug || slugify(c.name)}`}
                </button>
              </Td>
              <Td className="text-right">
                <button onClick={() => openEdit(c)} className={btnIcon}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar empresa' : 'Nueva empresa'}
        kicker={editing ? 'EDITAR EMPRESA' : 'CREAR EMPRESA'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear empresa'}
      />
    </div>
  );
}