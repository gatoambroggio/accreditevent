import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Eye, FileText, Download, Plus, Pencil, Settings2, ChevronDown, ChevronRight, ShieldCheck, Trash2 } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import DocumentViewer from '@/components/DocumentViewer';
import InsuranceValidationModal from '@/components/InsuranceValidationModal';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { slugify } from '@/lib/slugify';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnOutline, btnIcon } from '@/components/ui/button-styles';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';

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
  const { items: crudItems, loading: crudLoading, error: crudError, update: crudUpdate, reload: crudReload } = useCrud('Document');
  const { docTypes, rawItems, refetch: refetchTypes } = useDocumentTypes();
  const [reviewing, setReviewing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showTypes, setShowTypes] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [validatingDoc, setValidatingDoc] = useState(null);
  const [productoraDocs, setProductoraDocs] = useState([]);
  const [productoraLoading, setProductoraLoading] = useState(false);
  const [productoraError, setProductoraError] = useState('');
  const [userRole, setUserRole] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const role = me?.data?.role || me?.role || '';
        setUserRole(role);
        if (role === 'productora') {
          setProductoraLoading(true);
          const res = await base44.functions.invoke('getProductoraDocuments', {});
          setProductoraDocs(res?.data?.documents || []);
        }
      } catch (e) {
        setProductoraError(e.message || 'Error al cargar documentos.');
      } finally {
        setProductoraLoading(false);
      }
    })();
  }, []);

  const isProductora = userRole === 'productora';
  const items = isProductora ? productoraDocs : crudItems;
  const loading = isProductora ? productoraLoading : crudLoading;
  const error = isProductora ? productoraError : crudError;

  const reloadProductora = async () => {
    setProductoraLoading(true);
    try {
      const res = await base44.functions.invoke('getProductoraDocuments', {});
      setProductoraDocs(res?.data?.documents || []);
    } catch (e) {
      setProductoraError(e.message || 'Error al cargar documentos.');
    } finally {
      setProductoraLoading(false);
    }
  };

  const reload = () => (isProductora ? reloadProductora() : crudReload());

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
        `${d.person_name} ${d.company || ''} ${d.original_name}`.toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter((d) => d.document_type === typeFilter);
    if (statusFilter) result = result.filter((d) => d.status === statusFilter);
    return result;
  }, [items, query, typeFilter, statusFilter]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const allFilteredIds = useMemo(() => filtered.map((d) => d.id), [filtered]);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} documento(s)? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      if (isProductora) {
        const res = await base44.functions.invoke('deleteDocuments', { document_ids: ids });
        if (res?.data?.error) throw new Error(res.data.error);
      } else {
        for (const id of ids) {
          try { await base44.entities.Document.delete(id); } catch {}
        }
      }
      setSelected(new Set());
      await reload();
    } catch (e) {
      alert('Error al eliminar: ' + (e.message || e));
    } finally {
      setDeleting(false);
    }
  };

  const docTypeLabel = (value) => docTypes.find((t) => t.value === value)?.label || value;

  const isInsuranceDoc = (d) => {
    const type = docTypes.find((t) => t.value === d.document_type);
    if (!type) return /seguro|insurance/i.test(d.document_type || '');
    return /seguro|insurance/i.test(type.value) || /seguro|insurance/i.test(type.label);
  };

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Empresa', 'Tipo', 'Archivo', 'Vence', 'Estado', 'Revisor', 'Fecha revisión'],
      filtered.map((d) => [
        d.person_name || '',
        d.company || '',
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
    if (isProductora) {
      await base44.functions.invoke('reviewDocument', {
        document_id: reviewing.id,
        status: data.status,
        expires_at: data.expires_at || '',
        review_note: data.review_note || '',
      });
    } else {
      const me = await base44.auth.me();
      await crudUpdate(reviewing.id, {
        status: data.status,
        expires_at: data.expires_at || '',
        review_note: data.review_note || '',
        reviewed_by: me?.full_name || me?.email || '',
        reviewed_at: new Date().toISOString(),
      });
    }
    await logAudit('document-review', 'Document', reviewing.id, data.status);
    await reload();
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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-emerald-700">{selected.size} seleccionado(s)</span>
          <button onClick={handleBulkDelete} disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> {deleting ? 'Eliminando…' : 'Eliminar selección'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 hover:text-slate-700">Limpiar</button>
        </div>
      )}

      <DataTable
        loading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyMessage={query || typeFilter || statusFilter ? 'Sin resultados para tu búsqueda.' : 'No hay documentos cargados.'}
        tableClassName="min-w-[900px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th className="w-10">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </Th>
            <Th>Persona</Th>
            <Th>Empresa</Th>
            <Th>Tipo</Th>
            <Th>Archivo</Th>
            <Th>Vence</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {paginated.map((d) => (
            <Tr key={d.id}>
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggleSelect(d.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </Td>
              <Td className="text-sm font-semibold text-slate-900">{d.person_name || '—'}</Td>
              <Td className="text-sm text-slate-500">{d.company || '—'}</Td>
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
                <div className="flex items-center justify-end gap-1.5">
                  {isInsuranceDoc(d) && (
                    <button onClick={() => setValidatingDoc(d)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100">
                      <ShieldCheck className="h-3.5 w-3.5" /> Validar seguro
                    </button>
                  )}
                  <button onClick={() => setReviewing(d)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                    <Eye className="h-3.5 w-3.5" /> Revisar
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {filtered.length > 15 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />
      )}

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
        entityName="Document"
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

      <InsuranceValidationModal
        document={validatingDoc}
        onClose={() => setValidatingDoc(null)}
        onValidated={() => { setValidatingDoc(null); reload(); }}
      />
    </div>
  );
}