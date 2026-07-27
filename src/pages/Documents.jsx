import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Eye, FileText, Download, Plus, Pencil, Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import DocumentViewer from '@/components/DocumentViewer';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { slugify } from '@/lib/slugify';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnOutline, btnIcon } from '@/components/ui/button-styles';

const TYPE_FIELDS = [
  { name: 'label', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej: Seguro de trabajo' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true },
];

const REVIEW_FIELDS = [
  {
    name: 'status', label: 'Estado de revisión', type: 'select',
    options: [
      { value: 'pending', label: 'Pendiente' },
      { value: 'approved', label: 'Aprobado' },
      { value: 'rejected', label: 'Rechazado' },
      { value: 'expired', label: 'Vencido' },
    ],
  },
  { name: 'expires_at', label: 'Fecha de vencimiento', type: 'date' },
  { name: 'review_note', label: 'Nota del revisor', type: 'textarea', full: true },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'expired', label: 'Vencido' },
];

export default function Documents() {
  const { items, loading, update } = useCrud('Document');
  const { docTypes, rawItems, refetch: refetchTypes } = useDocumentTypes();
  const [reviewing, setReviewing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showTypes, setShowTypes] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);

  const isExpired = (d) => {
    if (d.status === 'expired') return true;
    if (d.status === 'approved' && d.expires_at && new Date(d.expires_at + 'T23:59:59') < new Date()) return true;
    return false;
  };

  const filtered = useMemo(() => {
    let result = items.filter((d) => !isExpired(d));
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((d) =>
        `${d.person_name} ${d.original_name}`.toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter((d) => d.document_type === typeFilter);
    if (statusFilter) result = result.filter((d) => d.status === statusFilter);
    return result;
  }, [items, query, typeFilter, statusFilter]);

  const docTypeLabel = (value) => docTypes.find((t) => t.value === value)?.label || value;

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Archivo', 'Vence', 'Estado', 'Revisor', 'Fecha revisión'],
      filtered.map((d) => [
        d.person_name || '',
        docTypeLabel(d.document_type) || '',
        d.original_name || '',
        d.expires_at ? d.expires_at.split('-').reverse().join('-') : '',
        d.status || '',
        d.reviewed_by || '',
        d.reviewed_at ? new Date(d.reviewed_at).toLocaleString('es-AR') : '',
      ]),
      'documentos'
    );
  };

  const handleReview = async (data) => {
    const me = await base44.auth.me();
    await update(reviewing.id, {
      status: data.status,
      expires_at: data.expires_at || '',
      review_note: data.review_note || '',
      reviewed_by: me?.full_name || me?.email || '',
      reviewed_at: new Date().toISOString(),
    });
    await logAudit('document-review', 'Document', reviewing.id, data.status);
  };

  const handleTypeSubmit = async (data) => {
    const slug = slugify(data.label);
    const enriched = { ...data, value: slug };
    if (editingType) {
      await base44.entities.DocumentType.update(editingType.id, enriched);
    } else {
      await base44.entities.DocumentType.create(enriched);
    }
    await refetchTypes();
  };

  const handleTypeDelete = async () => {
    await base44.entities.DocumentType.delete(editingType.id);
    await refetchTypes();
  };

  const openNewType = () => { setEditingType(null); setTypeModalOpen(true); };
  const openEditType = (item) => { setEditingType(item); setTypeModalOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Revisión" title="Documentos">
        <button onClick={() => setShowTypes((s) => !s)} className={btnOutline}>
          {showTypes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Settings2 className="h-4 w-4" /> Tipos de documento
        </button>
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      {showTypes && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Tipos de documento</h2>
            <button onClick={openNewType}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800">
              <Plus className="h-3.5 w-3.5" /> Nuevo tipo
            </button>
          </div>
          <div className="overflow-x-auto">
            {rawItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No hay tipos configurados. Usando los predeterminados.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <Th>Nombre</Th>
                    <Th>Identificador</Th>
                    <Th>Descripción</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rawItems.map((t) => (
                    <Tr key={t.id}>
                      <Td className="text-sm font-semibold text-slate-900">{t.label}</Td>
                      <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{t.value}</code></Td>
                      <Td className="text-sm text-slate-500">{t.description || '—'}</Td>
                      <Td className="text-right">
                        <button onClick={() => openEditType(t)} className={btnIcon}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por persona o archivo…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} options={docTypes.map((t) => ({ value: t.value, label: t.label }))} placeholder="Todos los tipos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage={query || typeFilter || statusFilter ? 'Sin resultados para tu búsqueda.' : 'No hay documentos cargados.'}
        tableClassName="min-w-[800px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Persona</Th>
            <Th>Tipo</Th>
            <Th>Archivo</Th>
            <Th>Vence</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <Tr key={d.id}>
              <Td className="text-sm font-semibold text-slate-900">{d.person_name || '—'}</Td>
              <Td className="text-sm text-slate-500">{docTypeLabel(d.document_type)}</Td>
              <Td>
                <button onClick={() => setViewingDoc(d)}
                  className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline">
                  <FileText className="h-3.5 w-3.5" /> {d.original_name}
                </button>
              </Td>
              <Td className="text-sm text-slate-500">{d.expires_at ? d.expires_at.split('-').reverse().join('-') : '—'}</Td>
              <Td><StatusBadge status={d.status} /></Td>
              <Td className="text-right">
                <button onClick={() => setReviewing(d)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                  <Eye className="h-3.5 w-3.5" /> Revisar
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title="Revisar documento"
        kicker="REVISIÓN DE DOCUMENTO"
        fields={REVIEW_FIELDS}
        initialData={reviewing || {}}
        onSubmit={handleReview}
        canDelete={false}
        submitLabel="Guardar revisión"
      />

      <EntityModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        title={editingType ? 'Editar tipo de documento' : 'Nuevo tipo de documento'}
        kicker={editingType ? 'EDITAR TIPO' : 'CREAR TIPO'}
        fields={TYPE_FIELDS}
        initialData={editingType || {}}
        onSubmit={handleTypeSubmit}
        onDelete={editingType ? handleTypeDelete : null}
        canDelete={!!editingType}
        submitLabel={editingType ? 'Guardar cambios' : 'Crear tipo'}
      />

      <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />
    </div>
  );
}