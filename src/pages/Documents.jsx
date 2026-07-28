import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Download, Trash2, Pencil, CheckCircle, XCircle, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import DocumentViewer from '@/components/DocumentViewer';
import { useCrud } from '@/lib/crud';
import { usePagination } from '@/lib/usePagination';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { formatDateTime } from '@/lib/formatDate';
import { exportToExcel } from '@/lib/exportUtils';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'expired', label: 'Vencido' },
];

export default function Documents() {
  const { items: docs, loading, error, create, update, remove } = useCrud('Document');
  const { docTypes } = useDocumentTypes();
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.Person.list('-created_date', 200),
      base44.entities.Event.list('-created_date', 100),
    ]).then(([ps, evs]) => { setPeople(ps); setEvents(evs); }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false;
      if (typeFilter && d.document_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return d.person_name?.toLowerCase().includes(q) || d.original_name?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [docs, search, statusFilter, typeFilter]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const fields = [
    { name: 'person_id', label: 'Persona', type: 'searchable-select', required: true, full: true,
      options: people.map((p) => ({ value: p.id, label: p.full_name })) },
    { name: 'event_id', label: 'Evento', type: 'searchable-select',
      options: events.map((e) => ({ value: e.id, label: e.name })) },
    { name: 'document_type', label: 'Tipo de documento', type: 'select', required: true,
      options: docTypes },
    { name: 'file_url', label: 'Archivo', type: 'image-upload', full: true },
    { name: 'expires_at', label: 'Fecha de vencimiento', type: 'date' },
    { name: 'status', label: 'Estado', type: 'select', options: STATUS_OPTIONS, defaultValue: 'pending' },
    { name: 'review_note', label: 'Nota de revisión', type: 'textarea', full: true },
  ];

  const handleSubmit = async (data) => {
    const person = people.find((p) => p.id === data.person_id);
    const evt = events.find((e) => e.id === data.event_id);
    const enriched = {
      ...data,
      person_name: person?.full_name || '',
      company: evt?.company || '',
    };
    if (editing) await update(editing.id, enriched);
    else await create(enriched);
  };

  const handleReview = async (doc, status) => {
    await update(doc.id, { status, reviewed_at: new Date().toISOString() });
  };

  const handleExport = () => {
    const headers = ['Persona', 'Tipo', 'Estado', 'Vencimiento', 'Subido'];
    const rows = filtered.map((d) => [
      d.person_name, d.document_type, d.status,
      d.expires_at || '', formatDateTime(d.created_date),
    ]);
    exportToExcel(headers, rows, 'documentos');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Documentos">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Subir documento
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por persona o archivo…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} options={docTypes} placeholder="Todos los tipos" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Todos los estados" />
      </div>

      <DataTable loading={loading} isEmpty={filtered.length === 0} error={error} emptyMessage="No hay documentos cargados.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Persona</Th>
            <Th>Tipo</Th>
            <Th>Vencimiento</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((d) => (
            <Tr key={d.id}>
              <Td><p className="font-semibold text-slate-900">{d.person_name || '—'}</p></Td>
              <Td>
                <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                  <FileText className="h-3.5 w-3.5" />
                  {docTypes.find((t) => t.value === d.document_type)?.label || d.document_type}
                </span>
              </Td>
              <Td className="text-sm text-slate-600">{d.expires_at || '—'}</Td>
              <Td><StatusBadge status={d.status} /></Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {d.status === 'pending' && (
                    <>
                      <button onClick={() => handleReview(d, 'approved')} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600" title="Aprobar">
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleReview(d, 'rejected')} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Rechazar">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button onClick={() => setViewer(d)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Ver">
                    <FileText className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setEditing(d); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar documento' : 'Subir documento'}
        kicker={editing ? 'EDITAR DOCUMENTO' : 'SUBIR DOCUMENTO'}
        fields={fields}
        initialData={editing || { status: 'pending' }}
        onSubmit={handleSubmit}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar cambios' : 'Subir'}
      />

      {viewer && <DocumentViewer doc={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}