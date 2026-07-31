import React, { useState, useMemo, useEffect } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Briefcase, Download, ShieldCheck, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import ProviderCompanyPeopleModal from '@/components/ProviderCompanyPeopleModal';
import CompanyEmployeesList from '@/components/CompanyEmployeesList';
import EventApprovalModal from '@/components/EventApprovalModal';
import PersonDetailModal from '@/components/PersonDetailModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';

export default function ProviderCompanies() {
  const { items, loading, error, create, update, remove } = useCrud('ProviderCompany');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [peopleModalCompany, setPeopleModalCompany] = useState(null);
  const [expandedCompany, setExpandedCompany] = useState(null);
  const [approvalModalCompany, setApprovalModalCompany] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [detailPerson, setDetailPerson] = useState(null);

  useEffect(() => {
    base44.entities.EventCompanyApproval.list('-created_date', 500)
      .then(setApprovals)
      .catch(() => {});
  }, [items]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const companyParam = urlParams.get('company');
    if (companyParam) {
      setExpandedCompany(decodeURIComponent(companyParam));
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((c) => `${c.name} ${c.description || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const fields = [
    { name: 'name', label: 'Nombre de la empresa', type: 'text', required: true, full: true, placeholder: 'Ej: Audiovisuales del Sur SA' },
    { name: 'cuit', label: 'CUIT', type: 'text', placeholder: 'Ej: 30-12345678-9', hint: '11 dígitos, sin guiones' },
    { name: 'responsible_name', label: 'Responsable', type: 'text', placeholder: 'Ej: Juan Pérez' },
    { name: 'address', label: 'Dirección', type: 'text', full: true, placeholder: 'Ej: Av. Corrientes 1234, CABA' },
    { name: 'description', label: 'Descripción / Rubro', type: 'textarea', full: true, placeholder: 'Ej: Proveedor de sonido e iluminación' },
    { name: 'insurance_kind', label: 'Tipo de seguro requerido', type: 'select', hint: 'ART: sin monto de cobertura · AP: con monto', options: [
      { value: '', label: 'Cualquiera' },
      { value: 'ART', label: 'ART — Aseguradora de Riesgos del Trabajo' },
      { value: 'AP', label: 'AP — Accidentes Personales' },
    ] },
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
      ['Empresa', 'CUIT', 'Responsable', 'Dirección', 'Descripción', 'Teléfono', 'Email'],
      filtered.map((c) => [c.name || '', c.cuit || '', c.responsible_name || '', c.address || '', c.description || '', c.contact_phone || '', c.contact_email || '']),
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
        error={error}
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
          {paginated.map((c) => (
            <React.Fragment key={c.id}>
            <Tr>
              <Td>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpandedCompany(expandedCompany === c.name ? null : c.name)}
                    className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedCompany === c.name ? 'rotate-180' : ''}`} />
                  </button>
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
                    {c.cuit && <p className="font-mono text-xs text-slate-500">CUIT: {c.cuit}</p>}
                    {c.responsible_name && <p className="text-xs text-slate-400">Resp.: {c.responsible_name}</p>}
                    {c.address && <p className="text-xs text-slate-400">{c.address}</p>}
                    {c.description && <p className="text-xs text-slate-400">{c.description}</p>}
                    {c.insurance_kind && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {c.insurance_kind === 'ART' ? 'ART · sin monto' : 'AP · con monto'}
                      </span>
                    )}
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
            {expandedCompany === c.name && (
              <tr className="border-b border-slate-50">
                <td colSpan={4} className="bg-slate-50/50 px-4">
                  <CompanyEmployeesList company={c} onSelectPerson={setDetailPerson} />
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}
        </tbody>
      </DataTable>

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

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
        entityName="ProviderCompany"
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

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} />
      )}
    </div>
  );
}