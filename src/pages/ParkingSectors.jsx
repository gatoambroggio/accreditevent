import React, { useState } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, SquareParking } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import PageHeader from '@/components/ui/page-header';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';
import { slugify } from '@/lib/slugify';

const FIELDS = [
  { name: 'label', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej: Estacionamiento VIP' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true, placeholder: 'Ej: Sector destinado a proveedores VIP' },
];

export default function ParkingSectors() {
  const { items, loading, create, update, remove } = useCrud('ParkingSector');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleSubmit = async (data) => {
    const slug = slugify(data.label);
    const enriched = { ...data, value: slug };
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Logística" title="Sectores de estacionamiento">
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo sector
        </button>
      </PageHeader>

      <DataTable
        loading={loading}
        isEmpty={items.length === 0}
        emptyIcon={SquareParking}
        emptyMessage="No hay sectores de estacionamiento configurados."
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Nombre</Th>
            <Th>Identificador</Th>
            <Th>Descripción</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Tr key={item.id}>
              <Td className="text-sm font-semibold text-slate-900">{item.label}</Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{item.value}</code></Td>
              <Td className="text-sm text-slate-500">{item.description || '—'}</Td>
              <Td className="text-right">
                <button onClick={() => openEdit(item)} className={btnIcon}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar sector' : 'Nuevo sector'}
        kicker={editing ? 'EDITAR SECTOR' : 'CREAR SECTOR'}
        fields={FIELDS}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear sector'}
      />
    </div>
  );
}