import React, { useState, useMemo, useEffect } from 'react';
import { Car } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { computeSectorOccupancy, sectorStatus } from '@/lib/parkingCapacity';

const VEHICLE_TYPE_LABELS = {
  auto: 'Auto',
  moto: 'Moto',
  camioneta: 'Camioneta',
  camion: 'Camión',
};

export default function VehicleAccreditSection({ vehicles, approvals, setApprovals, sectors, event }) {
  const [eventVehicles, setEventVehicles] = useState([]);

  useEffect(() => {
    if (!event?.id) { setEventVehicles([]); return; }
    let cancelled = false;
    base44.entities.Vehicle.filter({ status: 'approved' }, '-created_date', 500)
      .then((all) => {
        if (cancelled) return;
        const evId = event.id;
        setEventVehicles(all.filter((v) => (v.event_ids || []).includes(evId)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [event?.id]);

  const occupancy = useMemo(() => computeSectorOccupancy(eventVehicles, event?.id || null), [eventVehicles, event?.id]);

  const toggleApprove = (id, checked) => {
    setApprovals((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), approved: checked },
    }));
  };

  const setSector = (id, sector) => {
    setApprovals((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { approved: false }), sector },
    }));
  };

  const allApproved = vehicles.length > 0 && vehicles.every((v) => approvals[v.id]?.approved);
  const toggleAll = (checked) => {
    setApprovals((prev) => {
      const next = { ...prev };
      vehicles.forEach((v) => { next[v.id] = { ...(next[v.id] || { sector: v.parking_sector || '' }), approved: checked }; });
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-start gap-3">
        <Car className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-blue-800">
              Esta persona tiene {vehicles.length} vehículo(s) para acreditar
            </p>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={allApproved}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-blue-700">Seleccionar todos</span>
            </label>
          </div>

          <div className="mt-2.5 space-y-2">
            {vehicles.map((v) => {
              const appr = approvals[v.id] || { approved: false, sector: v.parking_sector || '' };
              const st = appr.sector ? sectorStatus(event, appr.sector, occupancy) : null;
              return (
                <div key={v.id} className="rounded-lg border border-blue-100 bg-white px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!appr.approved}
                      onChange={(e) => toggleApprove(v.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      {v.plate}
                    </span>
                    <span className="text-sm text-slate-700">{v.brand} {v.model}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type] || 'Auto'}
                    </span>
                    {v.color && <span className="text-xs text-slate-400">{v.color}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-6">
                    <span className="text-xs font-medium text-slate-500">Sector:</span>
                    <select
                      value={appr.sector || ''}
                      onChange={(e) => setSector(v.id, e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500"
                    >
                      <option value="">Sin sector</option>
                      {sectors.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    {st && st.cap > 0 && (
                      <span className={`text-xs font-semibold ${st.full ? 'text-red-600' : 'text-emerald-700'}`}>
                        {st.label} {st.full && <span className="rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold uppercase text-white ml-1">Agotado</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-blue-600">
            Marcá los vehículos a acreditar y asigná su sector. Podés acreditar aunque el sector esté agotado.
          </p>
        </div>
      </div>
    </div>
  );
}