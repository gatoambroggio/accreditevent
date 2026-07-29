import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useCrud } from '@/lib/crud';
import { Plus, Pencil, SquareParking, Save } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import PageHeader from '@/components/ui/page-header';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';
import { slugify } from '@/lib/slugify';
import { computeSectorOccupancy, sectorStatus } from '@/lib/parkingCapacity';
import FilterSelect from '@/components/ui/filter-select';

const FIELDS = [
  { name: 'label', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej: Estacionamiento VIP' },
  { name: 'description', label: 'Descripción', type: 'textarea', full: true, placeholder: 'Ej: Sector destinado a proveedores VIP' },
];

export default function ParkingSectors() {
  const { items, loading, create, update, remove } = useCrud('ParkingSector');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [capacities, setCapacities] = useState({});
  const [savingCaps, setSavingCaps] = useState(false);
  const [capSaved, setCapSaved] = useState(false);
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    base44.entities.Event.list('-start_at', 200).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    const load = () => base44.entities.Vehicle.list('-created_date', 500).then(setVehicles).catch(() => {});
    load();
    const unsub = base44.entities.Vehicle.subscribe(() => load());
    return unsub;
  }, []);

  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId), [events, selectedEventId]);

  useEffect(() => {
    const caps = selectedEvent?.parking_capacities || {};
    const map = {};
    items.forEach((s) => { map[s.value] = typeof caps[s.value] === 'number' ? caps[s.value] : ''; });
    setCapacities(map);
    setCapSaved(false);
  }, [selectedEventId, selectedEvent, items]);

  const occupancy = useMemo(() => computeSectorOccupancy(vehicles, selectedEventId), [vehicles, selectedEventId]);
  const sectorStatuses = useMemo(() => {
    const map = {};
    items.forEach((s) => { map[s.value] = sectorStatus(selectedEvent, s.value, occupancy); });
    return map;
  }, [items, selectedEvent, occupancy]);

  const handleCapChange = (sectorValue, val) => {
    setCapacities((c) => ({ ...c, [sectorValue]: val }));
    setCapSaved(false);
  };

  const handleSaveCapacities = async () => {
    if (!selectedEventId) return;
    setSavingCaps(true);
    try {
      const cleanCaps = {};
      items.forEach((s) => {
        const raw = capacities[s.value];
        const num = parseInt(raw, 10);
        if (!isNaN(num) && num > 0) cleanCaps[s.value] = num;
      });
      await base44.entities.Event.update(selectedEventId, { parking_capacities: cleanCaps });
      setEvents((prev) => prev.map((e) => e.id === selectedEventId ? { ...e, parking_capacities: cleanCaps } : e));
      setCapSaved(true);
    } catch {}
    setSavingCaps(false);
  };

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

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Capacidades por evento</h2>
            <p className="mt-0.5 text-sm text-slate-500">Definí cuántos vehículos admite cada sector y mirá la ocupación en tiempo real según las credenciales vehiculares emitidas.</p>
          </div>
          <FilterSelect
            value={selectedEventId}
            onChange={setSelectedEventId}
            options={events.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="Seleccionar evento…"
            className="min-w-[220px]"
          />
        </div>

        {selectedEventId ? (
          <>
            {items.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No hay sectores configurados.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {items.map((s) => {
                  const st = sectorStatuses[s.value] || { cap: 0, used: 0, full: false, label: 'Sin límite' };
                  const pct = st.cap ? Math.min(100, Math.round((st.used / st.cap) * 100)) : 0;
                  return (
                    <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{s.value}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">Capacidad máx.</span>
                          <input
                            type="number"
                            min={0}
                            value={capacities[s.value] ?? ''}
                            onChange={(e) => handleCapChange(s.value, e.target.value)}
                            placeholder="Sin límite"
                            className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <span className="text-xs text-slate-400">vehículos</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={st.full ? 'h-full bg-red-500' : 'h-full bg-emerald-500'}
                            style={{ width: `${st.cap ? pct : 0}%` }}
                          />
                        </div>
                        <span className={st.full ? 'text-xs font-bold text-red-600' : 'text-xs font-bold text-emerald-700'}>
                          {st.cap ? `${st.used}/${st.cap}` : `${st.used} sin límite`}
                        </span>
                        {st.full && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Agotado</span>}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={handleSaveCapacities} disabled={savingCaps} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                    {savingCaps ? 'Guardando…' : <><Save className="h-4 w-4" /> Guardar capacidades</>}
                  </button>
                  {capSaved && <span className="text-sm font-medium text-emerald-600">✓ Capacidades guardadas</span>}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Seleccioná un evento para configurar las capacidades por sector.</p>
        )}
      </div>

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