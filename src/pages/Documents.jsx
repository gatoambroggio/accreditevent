import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Eye, Loader2, FileText, Search, Download, Plus, Pencil, Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import DocumentViewer from '@/components/DocumentViewer';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { slugify } from '@/lib/slugify';

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
        d.expires_at || '',
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
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Revisión</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Documentos</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTypes((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            {showTypes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Settings2 className="h-4 w-4" /> Tipos de documento
          </button>
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

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
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nombre</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Identificador</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Descripción</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rawItems.map((t) => (
                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{t.label}</td>
                      <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{t.value}</code></td>
                      <td className="px-4 py-3 text-sm text-slate-500">{t.description || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditType(t)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por persona o archivo…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los tipos</option>
          {docTypes.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="approved">Aprobado</option>
          <option value="rejected">Rechazado</option>
          <option value="expired">Vencido</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{query || typeFilter || statusFilter ? 'Sin resultados para tu búsqueda.' : 'No hay documentos cargados.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Archivo</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Vence</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{d.person_name || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{docTypeLabel(d.document_type)}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setViewingDoc(d)}
                        className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline">
                        <FileText className="h-3.5 w-3.5" /> {d.original_name}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{d.expires_at || '—'}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => setReviewing(d)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                        <Eye className="h-3.5 w-3.5" /> Revisar
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