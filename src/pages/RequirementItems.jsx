import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Boxes, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';

export default function RequirementItems() {
  const { items, loading, create, update, remove } = useCrud('RequirementItem');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((i) => `${i.name} ${i.category || ''} ${i.description || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const fields = [
    { name: 'name', label: 'Nombre del ítem', type: 'text', required: true, full: true, placeholder: 'Ej: Toma eléctrica 220V' },
    { name: 'description', label: 'Descripción', type: 'textarea', full: true, placeholder: 'Detalle del ítem solicitado' },
    { name: 'category', label: 'Categoría', type: 'text', placeholder: 'Ej: Electricidad, Infraestructura, Conectividad' },
    { name: 'unit', label: 'Unidad de medida', type: 'text', placeholder: 'Unidad, m², Watts, metros…', defaultValue: 'Unidad' },
    { name: 'requires_quantity', label: 'Requiere cantidad', type: 'checkbox' },
    { name: 'is_active', label: 'Activo (disponible para solicitar)', type: 'checkbox' },
  ];

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item) => { setEditing(item); setModalOpen(true); };

  const handleSubmit = async (data) => {
    if (editing) await update(editing.id, data);
    else await create({ ...data, is_active: data.is_active ?? true, requires_quantity: data.requires_quantity ?? true });
  };

  const handleDelete = async () => { await remove(editing.id); };

  const handleExport = () => {
    exportToExcel(
      ['Ítem', 'Categoría', 'Unidad', 'Cantidad', 'Activo'],
      filtered.map((i) => [i.name || '', i.category || '', i.unit || '', i.requires_quantity ? 'Sí' : 'No', i.is_active ? 'Sí' : 'No']),
      'catalogo-logistica'
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Configuración" title="Ítems de logística">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={openNew} className={btnPrimary}>
          <Plus className="h-4 w-4" /> Nuevo ítem
        </button>
      </PageHeader>

      <div className="max-w-md">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar ítem…" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon={Boxes}
        emptyMessage={query ? 'Sin resultados.' : 'No hay ítems configurados. Creá el primero.'}
        tableClassName="min-w-[640px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Ítem</Th>
            <Th>Categoría</Th>
            <Th>Unidad</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => (
            <Tr key={item.id}>
              <Td>
                <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
              </Td>
              <Td className="text-sm text-slate-500">{item.category || '—'}</Td>
              <Td className="text-sm text-slate-500">{item.requires_quantity ? item.unit || 'Unidad' : 'Sí/No'}</Td>
              <Td>
                {item.is_active !== false ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">Activo</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">Inactivo</span>
                )}
              </Td>
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
        title={editing ? 'Editar ítem' : 'Nuevo ítem de logística'}
        kicker={editing ? 'EDITAR ÍTEM' : 'CREAR ÍTEM'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear ítem'}
      />
    </div>
  );
}