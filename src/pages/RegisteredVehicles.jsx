import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import StatusBadge from '@/components/StatusBadge';
import { usePagination } from '@/lib/usePagination';
import { exportToExcel } from '@/lib/exportUtils';
import { useZones } from '@/lib/useZones';
import { useParkingSectors } from '@/lib/useParkingSectors';

export default function RegisteredVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sectors } = useParkingSectors();

  useEffect(() => {
    base44.entities.Vehicle.list('-created_date', 200)
      .then(setVehicles)
      .catch(() => {});
    setLoading(false);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter((v) =>
      v.person_name?.toLowerCase().includes(q) ||
      v.plate?.toLowerCase().includes(q) ||
      v.brand?.toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleExport = () => {
    const headers = ['Persona', 'Marca', 'Modelo', 'Patente', 'Color', 'Sector', 'Estado'];
    const rows = filtered.map((v) => [
      v.person_name, v.brand, v.model, v.plate, v.color,
      sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector,
      v.status,
    ]);
    exportToExcel(headers, rows, 'vehiculos_registrados');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Reportes" title="Vehículos registrados">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por persona, patente o marca…" />

      <DataTable loading={loading} isEmpty={filtered.length === 0} emptyMessage="No hay vehículos registrados.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Persona</Th>
            <Th>Vehículo</Th>
            <Th>Patente</Th>
            <Th>Sector</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((v) => (
            <Tr key={v.id}>
              <Td><p className="font-semibold text-slate-900">{v.person_name}</p></Td>
              <Td className="text-sm text-slate-600">{v.brand} {v.model} · {v.color}</Td>
              <Td><span className="font-mono text-xs font-bold text-slate-900">{v.plate}</span></Td>
              <Td className="text-sm text-slate-600">{sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '—'}</Td>
              <Td><StatusBadge status={v.status} /></Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />}
    </div>
  );
}