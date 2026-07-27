import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Loader2, Search, Building2, Copy, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { slugify } from '@/lib/slugify';
import EntityModal from '@/components/EntityModal';
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
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Gestión</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Empresas</h1>
        </div>
        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">{query ? 'Sin resultados para tu búsqueda.' : 'No hay empresas registradas. Creá la primera.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Empresa</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Usuarios</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Link de registro</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5">
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
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Users className="h-3 w-3" /> {c.assigned_user_ids?.length || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => copyLink(c)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-600 transition hover:bg-slate-50">
                        <Copy className="h-3 w-3" />
                        {copiedId === c.id ? '¡Copiado!' : `/registro/${c.slug || slugify(c.name)}`}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => openEdit(c)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
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