import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Users, Car, CheckCircle2, XCircle, DoorOpen, FileBarChart, Download, Search } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import { formatDateTime, parseServerDate } from '@/lib/formatDate';

const userEventIdsRef = { current: [] };
const userCompanyRef = { current: '' };
const isProductoraRef = { current: false };

const shouldShowLog = (log) => {
  if (isProductoraRef.current) {
    if (!userCompanyRef.current) return false;
    return log.company === userCompanyRef.current;
  }
  const ids = userEventIdsRef.current;
  if (!ids || ids.length === 0) return true;
  return ids.includes(log.event_id);
};

const ZONE_LABELS = {
  general: 'General',
  backstage: 'Backstage',
  technical: 'Técnica',
  vip: 'VIP',
};

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState('person');
  const [events, setEvents] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const isProductora = user?.role === 'productora';
    isProductoraRef.current = isProductora;
    userCompanyRef.current = user?.company || user?.data?.company || '';
    userEventIdsRef.current = isProductora ? (user?.assigned_event_ids || user?.data?.assigned_event_ids || []) : [];

    (async () => {
      try {
        const [evs, accs, vehs, logs] = await Promise.all([
          base44.entities.Event.list('-created_date', 100),
          base44.entities.Accreditation.list('-created_date', 500),
          base44.entities.Vehicle.list('-created_date', 500),
          base44.entities.AccessLog.list('-created_date', 500),
        ]);
        setEvents(evs);
        setAccreditations(accs);
        setVehicles(vehs);
        setAccessLogs(logs.filter(shouldShowLog));
      } catch {}
      setLoading(false);
    })();

    const unsubscribe = base44.entities.AccessLog.subscribe((event) => {
      setAccessLogs((prev) => {
        if (event.type === 'create' && event.data) {
          if (!shouldShowLog(event.data)) return prev;
          return [{ ...event.data, result: event.data.result || 'granted' }, ...prev].slice(0, 500);
        }
        if (event.type === 'update' && event.data) {
          if (!shouldShowLog(event.data)) return prev.filter((l) => l.id !== event.data.id);
          return prev.map((l) => (l.id === event.data.id ? { ...event.data, result: event.data.result || 'granted' } : l));
        }
        if (event.type === 'delete' && event.id) {
          return prev.filter((l) => l.id !== event.id);
        }
        return prev;
      });
    });

    return () => unsubscribe();
  }, [user]);

  const isVehicleLog = (l) => l.resource_type === 'vehicle';

  const tabLogs = useMemo(() => {
    let logs = accessLogs.filter((l) => (tab === 'vehicle' ? isVehicleLog(l) : !isVehicleLog(l)));
    if (eventFilter) {
      const evt = events.find((e) => e.id === eventFilter);
      if (evt) logs = logs.filter((l) => l.event_name === evt.name);
    }
    if (resultFilter) {
      logs = logs.filter((l) => (resultFilter === 'granted' ? l.result !== 'denied' : l.result === 'denied'));
    }
    const q = query.toLowerCase().trim();
    if (q) {
      logs = logs.filter((l) => `${l.person_name} ${l.badge_code}`.toLowerCase().includes(q));
    }
    return logs;
  }, [accessLogs, tab, eventFilter, resultFilter, query, events]);

  const filteredAccreditations = useMemo(() => {
    let list = accreditations;
    if (isProductoraRef.current && userCompanyRef.current) {
      list = list.filter((a) => a.company === userCompanyRef.current);
    }
    if (!eventFilter) return list;
    return list.filter((a) => a.event_id === eventFilter);
  }, [accreditations, eventFilter]);

  const filteredVehicles = useMemo(() => {
    let list = vehicles;
    if (isProductoraRef.current && userCompanyRef.current) {
      list = list.filter((v) => v.company === userCompanyRef.current);
    }
    if (!eventFilter) return list;
    return list.filter((v) => v.event_ids?.includes(eventFilter));
  }, [vehicles, eventFilter]);

  const stats = useMemo(() => {
    const granted = tabLogs.filter((l) => l.result !== 'denied').length;
    const denied = tabLogs.filter((l) => l.result === 'denied').length;
    const total = tab === 'vehicle' ? filteredVehicles.length : filteredAccreditations.length;
    return { total, granted, denied };
  }, [tab, filteredAccreditations, filteredVehicles, tabLogs]);

  const groupStats = useMemo(() => {
    const map = {};
    for (const log of tabLogs) {
      const key = tab === 'vehicle'
        ? (log.badge_code || log.person_name || 'Desconocido')
        : (log.person_name || log.badge_code || 'Desconocido');
      if (!map[key]) {
        map[key] = { name: log.person_name || '—', badge_code: log.badge_code, granted: 0, denied: 0, zones: {} };
      }
      if (log.result === 'denied') {
        map[key].denied++;
      } else {
        map[key].granted++;
        const zone = log.zone || (tab === 'vehicle' ? log.access_level : 'general');
        map[key].zones[zone] = (map[key].zones[zone] || 0) + 1;
      }
    }
    const arr = Object.values(map).sort((a, b) => (b.granted + b.denied) - (a.granted + a.denied));
    return arr;
  }, [tabLogs, tab]);

  const handleExportList = () => {
    if (tab === 'vehicle') {
      exportToExcel(
        ['Titular', 'Marca', 'Modelo', 'Patente', 'Color', 'Sector', 'Eventos'],
        filteredVehicles.map((v) => [
          v.person_name || '',
          v.brand || '',
          v.model || '',
          v.plate || '',
          v.color || '',
          v.parking_sector || '',
          (v.event_names || []).join(', '),
        ]),
        'vehiculos'
      );
    } else {
      exportToExcel(
        ['Persona', 'Tipo', 'Evento', 'Código', 'Área', 'Nivel de acceso', 'Estado', 'Biometría'],
        filteredAccreditations.map((a) => [
          a.person_name || '',
          a.person_type || '',
          a.event_name || '',
          a.badge_code || '',
          a.area || '',
          a.access_level || '',
          a.status || '',
          a.has_biometric ? 'Sí' : 'No',
        ]),
        'acreditados'
      );
    }
  };

  const handleExportLogs = () => {
    if (tab === 'vehicle') {
      exportToExcel(
        ['Titular', 'Patente', 'Evento', 'Sector', 'Resultado', 'Usuario', 'Fecha'],
        tabLogs.map((l) => [
          l.person_name || '',
          l.badge_code || '',
          l.event_name || '',
          l.access_level || l.zone || '',
          l.result === 'denied' ? 'Denegado' : 'Concedido',
          l.verified_by || '',
          l.created_date ? parseServerDate(l.created_date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '',
        ]),
        'accesos_vehiculos'
      );
    } else {
      exportToExcel(
        ['Persona', 'Credencial', 'Evento', 'Zona', 'Resultado', 'Método', 'Usuario', 'Fecha'],
        tabLogs.map((l) => [
          l.person_name || '',
          l.badge_code || '',
          l.event_name || '',
          l.zone || '',
          l.result === 'denied' ? 'Denegado' : 'Concedido',
          l.method === 'biometric' ? 'Facial' : 'Manual',
          l.verified_by || '',
          l.created_date ? parseServerDate(l.created_date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '',
        ]),
        'accesos'
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const isVehicle = tab === 'vehicle';

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Análisis</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Reportes</h1>
      </div>

      {/* Tab toggle */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          onClick={() => setTab('person')}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === 'person' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Personas
        </button>
        <button
          onClick={() => setTab('vehicle')}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === 'vehicle' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Vehículos
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="relative min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            {isVehicle ? 'Buscar vehículo' : 'Buscar persona'}
          </label>
          <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isVehicle ? 'Patente o titular…' : 'Nombre o credencial…'}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Evento</label>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos los eventos</option>
            {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Resultado</label>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos</option>
            <option value="granted">Concedidos</option>
            <option value="denied">Denegados</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handleExportList}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> {isVehicle ? 'Exportar vehículos' : 'Exportar acreditados'}
          </button>
          <button onClick={handleExportLogs}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar accesos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              {isVehicle ? <Car className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">{isVehicle ? 'Vehículos' : 'Acreditados'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.granted}</p>
              <p className="text-xs text-slate-500">Ingresos concedidos</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{stats.denied}</p>
              <p className="text-xs text-slate-500">Accesos denegados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Group stats table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {isVehicle ? <Car className="h-4 w-4 text-emerald-600" /> : <DoorOpen className="h-4 w-4 text-emerald-600" />}
            {isVehicle ? 'Accesos por vehículo' : 'Accesos por persona'}
          </h2>
        </div>
        {groupStats.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No hay registros de acceso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {isVehicle ? (
                    <>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Patente</th>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Titular</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Credencial</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Ingresos</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Denegados</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">{isVehicle ? 'Sectores' : 'Zonas accedidas'}</th>
                </tr>
              </thead>
              <tbody>
                {groupStats.map((p, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    {isVehicle ? (
                      <>
                        <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p.badge_code || '—'}</code></td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{p.name}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{p.name}</td>
                        <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{p.badge_code || '—'}</code></td>
                      </>
                    )}
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{p.granted}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-600">{p.denied || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {Object.entries(p.zones).map(([zone, count]) => (
                        <span key={zone} className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5">
                          {ZONE_LABELS[zone] || zone}: {count}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Access log table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileBarChart className="h-4 w-4 text-emerald-600" /> Registro de accesos
          </h2>
        </div>
        {tabLogs.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No hay registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {isVehicle ? (
                    <>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Titular</th>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Patente</th>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Sector</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Persona</th>
                      <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Zona</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Resultado</th>
                  {!isVehicle && <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Método</th>}
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Usuario</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {tabLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    {isVehicle ? (
                      <>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{log.person_name || '—'}</td>
                        <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{log.badge_code || '—'}</code></td>
                        <td className="px-4 py-3 text-sm text-slate-500">{log.access_level || log.zone || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{log.person_name || '—'}</p>
                          <p className="text-xs text-slate-400">{log.badge_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">{ZONE_LABELS[log.zone] || log.zone || '—'}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {log.result === 'denied' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-200">Denegado</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200">Concedido</span>
                      )}
                    </td>
                    {!isVehicle && <td className="px-4 py-3 text-sm text-slate-500">{log.method === 'biometric' ? 'Facial' : 'Manual'}</td>}
                    <td className="px-4 py-3 text-sm text-slate-500">{log.verified_by || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(log.created_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}