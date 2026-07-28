import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, UserSearch } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import FilterSelect from '@/components/ui/filter-select';
import StatusBadge from '@/components/StatusBadge';
import { usePagination } from '@/lib/usePagination';
import { exportToExcel } from '@/lib/exportUtils';
import { formatDateTime } from '@/lib/formatDate';

export default function RegisteredPeople() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    Promise.all([
      base44.entities.User.list('-created_date', 200),
      base44.entities.Event.list('-created_date', 100),
    ]).then(([us, evs]) => { setUsers(us); setEvents(evs); }).catch(() => {});
    setLoading(false);
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.full_name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users, search]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleExport = () => {
    const headers = ['Nombre', 'Email', 'Rol', 'Registrado'];
    const rows = filtered.map((u) => [u.full_name, u.email, u.role, formatDateTime(u.created_date)]);
    exportToExcel(headers, rows, 'usuarios_registrados');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Reportes" title="Personas registradas">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{users.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Admins</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Operadores</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{users.filter((u) => ['control', 'coordinator', 'productora'].includes(u.role)).length}</p>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o email…" />

      <DataTable loading={loading} isEmpty={filtered.length === 0} emptyMessage="No hay usuarios registrados.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th>Registrado</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((u) => (
            <Tr key={u.id}>
              <Td>
                <p className="font-semibold text-slate-900">{u.full_name || 'Sin nombre'}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </Td>
              <Td>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{u.role || 'user'}</span>
              </Td>
              <Td className="text-sm text-slate-600">{formatDateTime(u.created_date)}</Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />}
    </div>
  );
}