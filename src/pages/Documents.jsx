import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Eye, Loader2, FileText, Search, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';

const DOC_TYPES = {
  dni: 'Documento de identidad',
  work_insurance: 'Seguro de trabajo',
  tax_certificate: 'Constancia fiscal',
  contract: 'Contrato',
  other: 'Otro',
};

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
  { name: 'review_note', label: 'Nota del revisor', type: 'textarea', full: true },
];

export default function Documents() {
  const { items, loading, update } = useCrud('Document');
  const [reviewing, setReviewing] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    let result = items;
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

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Tipo', 'Archivo', 'Vence', 'Estado', 'Revisor', 'Fecha revisión'],
      filtered.map((d) => [
        d.person_name || '',
        DOC_TYPES[d.document_type] || d.document_type || '',
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
      review_note: data.review_note || '',
      reviewed_by: me?.full_name || me?.email || '',
      reviewed_at: new Date().toISOString(),
    });
    await logAudit('document-review', 'Document', reviewing.id, data.status);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Revisión</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Documentos</h1>
        </div>
        <button onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

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
          {Object.entries(DOC_TYPES).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
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
                    <td className="px-4 py-3.5 text-sm text-slate-500">{DOC_TYPES[d.document_type] || d.document_type}</td>
                    <td className="px-4 py-3.5">
                      <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-emerald-700 hover:underline">
                        <FileText className="h-3.5 w-3.5" /> {d.original_name}
                      </a>
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
    </div>
  );
}