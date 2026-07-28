import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Cpu, Copy } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { useCrud } from '@/lib/crud';
import { useZones } from '@/lib/useZones';
import { formatDateTime } from '@/lib/formatDate';

export default function ZKTecoDevices() {
  const { items: devices, loading, error, create, update, remove } = useCrud('ZKTecoDevice');
  const { zones } = useZones();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return devices;
    const q = search.toLowerCase();
    return devices.filter((d) =>
      d.name?.toLowerCase().includes(q) || d.serial_number?.toLowerCase().includes(q)
    );
  }, [devices, search]);

  const fields = [
    { name: 'serial_number', label: 'Número de serie', required: true },
    { name: 'name', label: 'Nombre descriptivo', required: true },
    { name: 'api_key', label: 'API Key', required: true, hint: 'Clave para autenticar push HTTP del dispositivo' },
    { name: 'zone', label: 'Zona de acceso', type: 'select', options: zones.map((z) => ({ value: z.value, label: z.label })) },
    { name: 'status', label: 'Estado', type: 'select', options: [
      { value: 'active', label: 'Activo' },
      { value: 'inactive', label: 'Inactivo' },
    ], defaultValue: 'active' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Hardware" title="Terminales ZKTeco">
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <Plus className="h-4 w-4" /> Nueva terminal
        </button>
      </PageHeader>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o serie…" />

      <DataTable loading={loading} isEmpty={filtered.length === 0} error={error} emptyMessage="No hay terminales registradas.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Dispositivo</Th>
            <Th>Serial</Th>
            <Th>Zona</Th>
            <Th>Última conexión</Th>
            <Th>Estado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <Tr key={d.id}>
              <Td>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold text-slate-900">{d.name}</span>
                </div>
              </Td>
              <Td><span className="font-mono text-xs text-slate-600">{d.serial_number}</span></Td>
              <Td className="text-sm text-slate-600">{zones.find((z) => z.value === d.zone)?.label || d.zone || '—'}</Td>
              <Td className="text-sm text-slate-600">{d.last_seen ? formatDateTime(d.last_seen) : '—'}</Td>
              <Td><StatusBadge status={d.status} /></Td>
              <Td className="text-right">
                <button onClick={() => { setEditing(d); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                  <Pencil className="h-4 w-4" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.name : 'Nueva terminal'}
        kicker={editing ? 'EDITAR TERMINAL' : 'CREAR TERMINAL'}
        fields={fields}
        initialData={editing || { status: 'active' }}
        onSubmit={async (data) => { editing ? await update(editing.id, data) : await create(data); }}
        canDelete={!!editing}
        onDelete={async () => { await remove(editing.id); }}
        submitLabel={editing ? 'Guardar' : 'Crear'}
      />
    </div>
  );
}