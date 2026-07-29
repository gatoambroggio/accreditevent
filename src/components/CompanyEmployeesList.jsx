import React, { useState, useEffect } from 'react';
import { Users, Loader2, ChevronDown, ChevronUp, IdCard, FileWarning, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StatusBadge from '@/components/StatusBadge';
import { useZones } from '@/lib/useZones';

export default function CompanyEmployeesList({ company }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const { zones } = useZones();

  const loadPeople = async () => {
    try {
      const linked = await base44.entities.Person.filter({ company: company.name }, '-created_date', 500);
      setPeople(linked);
    } catch {
      setPeople([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPeople();
  }, [company.name]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="py-6 text-center">
        <Users className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-400">
          No hay empleados visibles para tu productora en esta empresa.
        </p>
        <p className="mt-1 text-xs text-slate-300">
          Los empleados deben estar asignados a tus eventos para ser visibles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <Users className="h-3 w-3" />
          {people.length} {people.length === 1 ? 'empleado' : 'empleados'}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Empleado</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Área</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Eventos asignados</th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const eventNames = p.event_names?.length ? p.event_names : [];
              return (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{p.full_name}</p>
                    <p className="text-xs text-slate-400">{p.document || 'Sin documento'}</p>
                  </td>
                  <td className="px-3 py-2">
                    {p.access_area ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {zones.find((z) => z.value === p.access_area)?.label || p.access_area}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {eventNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {eventNames.map((name, i) => (
                          <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}