import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import { usePagination } from '@/lib/usePagination';
import { formatDateTime } from '@/lib/formatDate';
import { exportToExcel } from '@/lib/exportUtils';

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.AuditLog.list('-created_date', 200);
        setLogs(data);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.actor_name?.toLowerCase().includes(q) ||
               l.entity?.toLowerCase().includes(q) ||
               l.detail?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, search, actionFilter]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 20);

  const handleExport = () => {
    const headers = ['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle'];
    const rows = filtered.map((l) => [
      formatDateTime(l.created_date), l.actor_name, l.action, l.entity, l.detail,
    ]);
    exportToExcel(headers, rows, 'auditoria');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Auditoría">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por usuario, entidad o detalle…" />
        <FilterSelect value={actionFilter} onChange={setActionFilter} options={[
          { value: 'create', label: 'Creación' },
          { value: 'update', label: 'Actualización' },
          { value: 'delete', label: 'Eliminación' },
        ]} placeholder="Todas las acciones" />
      </div>

      <DataTable loading={loading} isEmpty={filtered.length === 0} emptyMessage="No hay registros de auditoría." skeletonCols={5}>
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Fecha</Th>
            <Th>Usuario</Th>
            <Th>Acción</Th>
            <Th>Entidad</Th>
            <Th>Detalle</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((l) => (
            <Tr key={l.id}>
              <Td className="text-sm text-slate-600">{formatDateTime(l.created_date)}</Td>
              <Td><span className="font-semibold text-slate-900">{l.actor_name}</span></Td>
              <Td>
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                  l.action === 'create' ? 'bg-emerald-50 text-emerald-700' :
                  l.action === 'update' ? 'bg-blue-50 text-blue-700' :
                  l.action === 'delete' ? 'bg-red-50 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{l.action}</span>
              </Td>
              <Td className="text-sm text-slate-600">{l.entity}</Td>
              <Td className="text-sm text-slate-500">{l.detail || '—'}</Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={20} />}
    </div>
  );
}