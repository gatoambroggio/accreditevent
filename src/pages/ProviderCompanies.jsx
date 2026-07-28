import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Briefcase, Download, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import ProviderCompanyPeopleModal from '@/components/ProviderCompanyPeopleModal';
import EventApprovalModal from '@/components/EventApprovalModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';

export default function ProviderCompanies() {
  const { items, loading, create, update, remove } = useCrud('ProviderCompany');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [peopleModalCompany, setPeopleModalCompany] = useState(null);
  const [approvalModalCompany, setApprovalModalCompany] = useState(null);
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    base44.entities.EventCompanyApproval.list('-created_date', 500)
      .then(setApprovals)
      .catch(() => {});
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((c) => `${c.name} ${c.description || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const fields = [
    { name: 'name', label: 'Nombre de la empresa', type: 'text', required: true, full: true, placeholder: 'Ej: Audiovisuales del Sur SA' },
    { name: 'description', label: 'Descripción / Rubro', type: 'textarea', full: true, placeholder: 'Ej: Proveedor de sonido e iluminación' },
    { name: 'contact_phone', label: 'Teléfono de contacto', type: 'phone-ar', hint: 'Código de área sin 0 y número sin 15' },
    { name: 'contact_email', label: 'Email de contacto', type: 'email', placeholder: 'Ej: contacto@empresa.com' },
    { name: 'logo_url', label: 'Logo', type: 'image-upload', full: true },
  ];

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleSubmit = async (data) => {
    if (editing) {
      await update(editing.id, data);
    } else {
      await create(data);
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  const handleExport = () => {
    exportToExcel(
      ['Empresa', 'Descripción', 'Teléfono', 'Email'],
      filtered.map((c) => [c.name || '', c.description || '', c.contact_phone || '', c.contact_email || '']),
      'empresas-proveedoras'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Directorio" title="Empresas proveedoras">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
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
        emptyIcon={Briefcase}
        emptyMessage={query ? 'Sin resultados para tu búsqueda.' : 'No hay empresas proveedoras registradas. Creá la primera.'}
        tableClassName="min-w-[780px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Empresa</Th>
            <Th>Eventos aprobados</Th>
            <Th>Contacto</Th>
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
                      <Briefcase className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <button
                      onClick={() => setPeopleModalCompany(c)}
                      className="text-left text-sm font-semibold text-slate-900 transition hover:text-emerald-600 hover:underline"
                    >
                      {c.name}
                    </button>
                    {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                  </div>
                </div>
              </Td>
              <Td>
                {(() => {
                  const approved = approvals.filter((a) => a.provider_company === c.name && a.status === 'approved');
                  return approved.length > 0 ? (
                    <button onClick={() => setApprovalModalCompany(c)} className="text-left">
                      <div className="flex flex-wrap gap-1">
                        {approved.map((a) => (
                          <span key={a.id} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{a.event_name}</span>
                        ))}
                      </div>
                    </button>
                  ) : (
                    <button onClick={() => setApprovalModalCompany(c)} className="text-xs text-slate-400 transition hover:text-emerald-600 hover:underline">
                      Sin eventos — asignar
                    </button>
                  );
                })()}
              </Td>
              <Td className="text-sm text-slate-500">
                {c.contact_phone && <p>{c.contact_phone}</p>}
                {c.contact_email && <p className="text-xs text-slate-400">{c.contact_email}</p>}
                {!c.contact_phone && !c.contact_email && '—'}
              </Td>
              <Td className="text-right">
                <div className="inline-flex items-center gap-1">
                  <button onClick={() => setApprovalModalCompany(c)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Asignar
                  </button>
                  <button onClick={() => openEdit(c)} className={btnIcon}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar empresa proveedora' : 'Nueva empresa proveedora'}
        kicker={editing ? 'EDITAR EMPRESA' : 'CREAR EMPRESA'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear empresa'}
      />

      {peopleModalCompany && (
        <ProviderCompanyPeopleModal
          company={peopleModalCompany}
          onClose={() => setPeopleModalCompany(null)}
        />
      )}

      {approvalModalCompany && (
        <EventApprovalModal
          providerCompany={approvalModalCompany}
          onClose={() => setApprovalModalCompany(null)}
        />
      )}
    </div>
  );
}