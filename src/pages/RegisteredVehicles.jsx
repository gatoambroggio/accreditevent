import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { getUserCompany } from '@/lib/userCompany';
import { Download, Car, CarFront, Check, XCircle } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import StatusBadge from '@/components/StatusBadge';
import { exportToExcel } from '@/lib/exportUtils';
import { parseServerDate } from '@/lib/formatDate';

export default function RegisteredVehicles() {
  const { user } = useAuth();
  const userCompany = getUserCompany(user);
  const isProductora = user?.role === 'productora';
  const [vehicles, setVehicles] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [vehs, evs] = await Promise.all([
          base44.entities.Vehicle.list('-created_date', 500),
          base44.entities.Event.list('-created_date', 100),
        ]);
        setVehicles(vehs);
        setEvents(evs);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = [...vehicles];
    // Filtrado por eventos de la productora (vehicle.company es la empresa proveedora)
    if (isProductora) {
      if (!userCompany) return [];
      const myEventIds = new Set(events.filter((e) => e.company === userCompany).map((e) => e.id));
      list = list.filter((v) => {
        if (v.company === userCompany) return true;
        const vehEventIds = Array.isArray(v.event_ids) ? v.event_ids : [];
        return vehEventIds.some((id) => myEventIds.has(id));
      });
    }
    if (eventFilter) list = list.filter((v) => v.event_ids?.includes(eventFilter));
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((v) =>
        `${v.person_name} ${v.plate} ${v.brand} ${v.model} ${v.color}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [vehicles, events, eventFilter, query, isProductora, userCompany]);

  const stats = useMemo(() => ({
    total: filtered.length,
    approved: filtered.filter((v) => v.status === 'approved').length,
  }), [filtered]);

  const handleExport = () => {
    exportToExcel(
      ['Titular', 'Marca', 'Modelo', 'Patente', 'Color', 'Sector', 'Eventos', 'Estado', 'Registrado'],
      filtered.map((v) => [
        v.person_name || '',
        v.brand || '',
        v.model || '',
        v.plate || '',
        v.color || '',
        v.parking_sector || '',
        (v.event_names || []).join(', '),
        v.status || '',
        v.created_date ? parseServerDate(v.created_date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '',
      ]),
      'vehiculos_registrados'
    );
  };

  const handleStatusChange = async (vehicle, newStatus) => {
    try {
      await base44.entities.Vehicle.update(vehicle.id, { status: newStatus });
      setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? { ...v, status: newStatus } : v)));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Histórico" title="Vehículos registrados">
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Vehículos registrados</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CarFront className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.approved}</p>
              <p className="text-xs text-slate-500">Autorizados</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Patente, titular, marca…"
        />
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          placeholder="Todos los eventos"
        />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon={Car}
        emptyMessage="No hay vehículos registrados."
        tableClassName="min-w-[800px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Titular</Th>
            <Th>Vehículo</Th>
            <Th>Patente</Th>
            <Th>Color</Th>
            <Th>Sector</Th>
            <Th>Eventos</Th>
            <Th>Estado</Th>
            <Th>Acciones</Th>
            <Th>Registrado</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((v) => (
            <Tr key={v.id}>
              <Td className="text-sm font-semibold text-slate-900">{v.person_name || '—'}</Td>
              <Td className="text-sm text-slate-600">{v.brand} {v.model}</Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{v.plate || '—'}</code></Td>
              <Td className="text-sm text-slate-600">{v.color || '—'}</Td>
              <Td className="text-sm text-slate-600">{v.parking_sector || '—'}</Td>
              <Td className="text-xs text-slate-500">
                {(v.event_names || []).join(', ') || '—'}
              </Td>
              <Td><StatusBadge status={v.status} /></Td>
              <Td>
                <div className="flex items-center gap-1">
                  {v.status !== 'approved' && (
                    <button onClick={() => handleStatusChange(v, 'approved')} className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 transition hover:bg-emerald-100" title="Aprobar">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {v.status !== 'rejected' && (
                    <button onClick={() => handleStatusChange(v, 'rejected')} className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-700 transition hover:bg-red-100" title="Rechazar">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Td>
              <Td className="text-xs text-slate-400">
                {v.created_date ? parseServerDate(v.created_date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'}
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}