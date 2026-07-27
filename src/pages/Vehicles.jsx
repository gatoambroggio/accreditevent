import React, { useState, useMemo } from 'react';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, Search, Loader2, Download, Car, Printer } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import EntityModal from '@/components/EntityModal';
import VehicleBadgePrint from '@/components/VehicleBadgePrint';
import { useParkingSectors } from '@/lib/useParkingSectors';
import { base44 } from '@/api/base44Client';

const validateVehicle = (data) => {
  const e = {};
  if (!data.person_id) e.person_id = 'Seleccioná una persona';
  if (!data.brand?.trim()) e.brand = 'La marca es obligatoria';
  if (!data.model?.trim()) e.model = 'El modelo es obligatorio';
  if (!data.plate?.trim()) e.plate = 'La patente es obligatoria';
  return e;
};

export default function Vehicles() {
  const { items, loading, create, update, remove } = useCrud('Vehicle');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState([]);
  const [printingVehicle, setPrintingVehicle] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const { sectors } = useParkingSectors();

  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [showPersonSearch, setShowPersonSearch] = useState(false);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((v) => {
      const person = people.find((p) => p.id === v.person_id);
      const personDoc = person?.document || '';
      return `${v.person_name || ''} ${v.brand || ''} ${v.model || ''} ${v.plate || ''} ${personDoc}`.toLowerCase().includes(q);
    });
  }, [items, query]);

  const handleExport = () => {
    exportToExcel(
      ['Persona', 'Marca', 'Modelo', 'Patente', 'Color', 'Estacionamiento', 'Notas'],
      filtered.map((v) => [
        v.person_name || '',
        v.brand || '',
        v.model || '',
        v.plate || '',
        v.color || '',
        sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '',
        v.notes || '',
      ]),
      'vehiculos'
    );
  };

  const loadPeople = async () => {
    if (peopleLoaded) return;
    try {
      const all = await base44.entities.Person.list('-created_date', 500);
      setPeople(all);
      setPeopleLoaded(true);
    } catch {}
  };

  React.useEffect(() => {
    (async () => {
      try {
        const [all, events] = await Promise.all([
          base44.entities.SystemSetting.list('-created_date', 1),
          base44.entities.Event.filter({ status: 'active' }, '-start_at', 1),
        ]);
        if (all[0]) setSettings(all[0]);
        if (events[0]) setActiveEvent(events[0]);
      } catch {}
    })();
  }, []);

  const openPrint = (vehicle) => setPrintingVehicle(vehicle);

  React.useEffect(() => {
    loadPeople();
  }, []);

  const openNew = () => {
    setEditing(null);
    setShowPersonSearch(false);
    loadPeople();
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setShowPersonSearch(false);
    loadPeople();
    setModalOpen(true);
  };

  const handleSubmit = async (data) => {
    const person = people.find((p) => p.id === data.person_id);
    const enriched = {
      ...data,
      person_name: person?.full_name || editing?.person_name || '',
      plate: (data.plate || '').toUpperCase().trim(),
    };
    if (editing) {
      await update(editing.id, enriched);
    } else {
      await create(enriched);
    }
  };

  const handleDelete = async () => { await remove(editing.id); };

  const fields = useMemo(() => [
    {
      name: 'person_id', label: 'Persona', type: 'searchable-select', required: true,
      options: people.map((p) => ({ value: p.id, label: `${p.full_name} · DNI ${p.document || '—'} · ${p.company || 'Sin empresa'}` })),
      placeholder: 'Buscar por nombre, DNI o empresa…',
    },
    { name: 'brand', label: 'Marca', type: 'text', required: true, placeholder: 'Ej: Ford' },
    { name: 'model', label: 'Modelo', type: 'text', required: true, placeholder: 'Ej: Fiesta' },
    { name: 'plate', label: 'Patente', type: 'text', required: true, placeholder: 'Ej: AB123CD', hint: 'Se guardará en mayúsculas.' },
    { name: 'color', label: 'Color', type: 'text', placeholder: 'Ej: Blanco' },
    {
      name: 'parking_sector', label: 'Sector de estacionamiento', type: 'select',
      options: sectors.map((s) => ({ value: s.value, label: s.label })),
      placeholder: 'Seleccionar sector…',
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Ej: Vehículo de carga' },
  ], [people, sectors]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Logística</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Vehículos</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> Nuevo vehículo
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por patente, persona, marca…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Car className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">{query ? 'Sin resultados para tu búsqueda.' : 'No hay vehículos registrados todavía.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Vehículo</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Patente</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estacionamiento</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Color</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{v.person_name || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{v.brand} {v.model}</td>
                    <td className="px-4 py-3.5">
                       <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-slate-700">
                         {v.plate}
                       </span>
                     </td>
                     <td className="px-4 py-3.5 text-sm text-slate-600">
                       {sectors.find((s) => s.value === v.parking_sector)?.label || v.parking_sector || '—'}
                     </td>
                     <td className="px-4 py-3.5 text-sm text-slate-500">{v.color || '—'}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPrint(v)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700" title="Imprimir credencial">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEdit(v)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar vehículo' : 'Nuevo vehículo'}
        kicker={editing ? 'EDITAR VEHÍCULO' : 'CREAR VEHÍCULO'}
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleSubmit}
        validate={validateVehicle}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing}
        submitLabel={editing ? 'Guardar cambios' : 'Crear vehículo'}
      />

      {printingVehicle && (
        <VehicleBadgePrint
          vehicle={printingVehicle}
          settings={settings}
          event={activeEvent}
          parkingSectors={sectors}
          onClose={() => setPrintingVehicle(null)}
        />
      )}
    </div>
  );
}