import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Car, CheckCircle2, XCircle, Clock, MapPin, User } from 'lucide-react';
import PatenteScanner from '@/components/PatenteScanner';
import PageHeader from '@/components/ui/page-header';
import { btnOutline } from '@/components/ui/button-styles';
import { Link } from 'react-router-dom';

const STATUS_META = {
  approved: { label: 'Aprobado', icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  pending: { label: 'Pendiente', icon: Clock, cls: 'text-amber-700 bg-amber-50 ring-amber-200' },
  rejected: { label: 'Rechazado', icon: XCircle, cls: 'text-red-700 bg-red-50 ring-red-200' },
};

export default function Patentes() {
  const [patente, setPatente] = useState('');
  const [searching, setSearching] = useState(false);
  const [vehicles, setVehicles] = useState(null); // null = no buscado todavía
  const [searched, setSearched] = useState(false);

  const buscar = async (p) => {
    setPatente(p);
    setSearching(true);
    setSearched(true);
    setVehicles(null);
    try {
      const res = await base44.entities.Vehicle.filter({ plate: p });
      setVehicles(res);
    } catch (e) {
      setVehicles([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Vehículos" title="Lector de patentes" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900">Escanear patente</h2>
          <PatenteScanner onPatente={buscar} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Car className="h-4 w-4 text-emerald-600" /> Resultado
          </h2>

          {!patente && !searching && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-slate-400">
              <Car className="h-10 w-10 text-slate-200" />
              <p className="mt-3">Escaneá una patente para buscar el vehículo.</p>
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="ml-2 text-sm text-slate-500">Buscando {patente}…</span>
            </div>
          )}

          {patente && !searching && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid min-w-[140px] place-items-center rounded-md border-2 border-slate-900 bg-white px-4 py-2">
                  <span className="font-mono text-2xl font-extrabold tracking-[0.15em] text-slate-900">{patente}</span>
                  <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">Argentina</span>
                </div>
                <Link to={`/vehicles?plate=${encodeURIComponent(patente)}`} className={btnOutline}>
                  Ver en vehículos
                </Link>
              </div>

              {searched && vehicles && vehicles.length === 0 && (
                <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
                  No se encontró ningún vehículo registrado con esa patente.
                </div>
              )}

              {vehicles && vehicles.length > 0 && (
                <div className="space-y-3">
                  {vehicles.map((v) => {
                    const meta = STATUS_META[v.status] || STATUS_META.pending;
                    const StatusIcon = meta.icon;
                    return (
                      <div key={v.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{v.brand} {v.model}</p>
                            <p className="text-xs text-slate-500 capitalize">{v.vehicle_type} · {v.color || 's/c'}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${meta.cls}`}>
                            <StatusIcon className="h-3.5 w-3.5" /> {meta.label}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs">
                          {v.person_name && (
                            <p className="flex items-center gap-1.5 text-slate-600"><User className="h-3.5 w-3.5 text-slate-400" /> {v.person_name}</p>
                          )}
                          {v.parking_sector && (
                            <p className="flex items-center gap-1.5 text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400" /> Sector {v.parking_sector}</p>
                          )}
                          {v.event_names && v.event_names.length > 0 && (
                            <p className="text-slate-500">Eventos: {v.event_names.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}