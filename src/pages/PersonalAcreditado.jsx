import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Users, BadgeCheck, Fingerprint, Pencil, Trash2, Check, Minus, Printer, Car } from 'lucide-react';
import { exportToExcel } from '@/lib/exportUtils';
import AccreditationEditModal from '@/components/AccreditationEditModal';
import PersonDetailModal from '@/components/PersonDetailModal';
import BadgePrint from '@/components/BadgePrint';
import VehicleBadgePrint from '@/components/VehicleBadgePrint';
import { useParkingSectors } from '@/lib/useParkingSectors';
import StatusBadge from '@/components/StatusBadge';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { PHASE_LABELS } from '@/lib/eventPhases';
import { useAuth } from '@/lib/AuthContext';
import { canManage } from '@/lib/accessUtils';

export default function PersonalAcreditado() {
  const [events, setEvents] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [detailPerson, setDetailPerson] = useState(null);
  const [settings, setSettings] = useState(null);
  const [printingPersonal, setPrintingPersonal] = useState(null);
  const [printingVehicular, setPrintingVehicular] = useState(null);
  const [vehicularAccredId, setVehicularAccredId] = useState(null);
  const [vehiclePick, setVehiclePick] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const { user } = useAuth();
  const canManageRecords = canManage(user);
  const { sectors } = useParkingSectors();

  useEffect(() => {
    (async () => {
      try {
        const [evs, accs, ps, sts, vs] = await Promise.all([
          base44.entities.Event.list('-created_date', 200),
          base44.entities.Accreditation.list('-created_date', 5000),
          base44.entities.Person.list('-created_date', 5000),
          base44.entities.SystemSetting.list('-created_date', 1),
          base44.entities.Vehicle.list('-created_date', 5000),
        ]);
        setEvents(evs);
        // Personal acreditado = acreditaciones activas/autorizadas (no bloqueadas ni revocadas)
        setAccreditations(accs);
        setPeople(ps);
        setSettings(sts[0] || null);
        setVehicles(vs);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const peopleById = useMemo(() => {
    const map = {};
    people.forEach((p) => { map[p.id] = p; });
    return map;
  }, [people]);

  const vehiclePersonIds = useMemo(() => new Set(vehicles.map((v) => v.person_id).filter(Boolean)), [vehicles]);

  const phaseLabel = (ph) => {
    if (!Array.isArray(ph) || ph.length === 0) return '—';
    return ph.map((v) => PHASE_LABELS[v] || v).join(', ');
  };

  const rows = useMemo(() => {
    let result = accreditations;
    if (statusFilter) result = result.filter((a) => a.status === statusFilter);
    if (eventFilter) result = result.filter((a) => a.event_id === eventFilter);
    const q = query.toLowerCase().trim();
    if (q) {
      result = result.filter((a) => {
        const p = peopleById[a.person_id] || {};
        return `${a.person_name} ${a.badge_code} ${a.person_type} ${p.document || ''}`.toLowerCase().includes(q);
      });
    }
    return result;
  }, [accreditations, eventFilter, statusFilter, query, peopleById]);

  const { page, setPage, totalPages, paginated } = usePagination(rows, 15);

  const eventOptions = useMemo(
    () => events.map((e) => ({ value: e.id, label: e.name })),
    [events]
  );

  const handleExport = () => {
    const headers = ['Nombre', 'Documento', 'Tipo', 'Área', 'Zonas de acceso', 'Días/Fases', 'Biometría', 'Credencial', 'Cred. personal', 'Cred. vehicular', 'Empresa', 'Evento', 'Estado'];
    const data = rows.map((a) => {
      const p = peopleById[a.person_id] || {};
      return [
        a.person_name || '',
        p.document || '',
        a.person_type || '',
        a.area || '',
        a.access_level || '',
        phaseLabel(a.event_phases),
        a.has_biometric ? 'Sí' : 'No',
        a.badge_code || '',
        a.delivered_personal ? 'Entregada' : 'No',
        a.delivered_vehicular ? 'Entregada' : 'No',
        a.company || '',
        a.event_name || '',
        a.status || '',
      ];
    });
    exportToExcel(headers, data, 'personal_acreditado');
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`¿Eliminar la acreditación de ${a.person_name} (${a.badge_code})? La persona volverá a estar pendiente de acreditar.`)) return;
    try {
      await base44.entities.Accreditation.delete(a.id);
      setAccreditations((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      alert('No se pudo eliminar: ' + (e?.message || e));
    }
  };

  const refreshAccred = async (id) => {
    try {
      const updated = await base44.entities.Accreditation.get(id);
      setAccreditations((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch {}
  };

  const handlePrintVehicular = (a) => {
    const vehs = vehicles.filter((v) => v.person_id === a.person_id);
    const assigned = vehs.filter((v) => (v.event_ids || []).includes(a.event_id));
    const list = assigned.length > 0 ? assigned : vehs;
    if (list.length === 0) {
      alert('La persona no tiene vehículos asignados.');
      return;
    }
    if (list.length === 1) {
      setVehicularAccredId(a.id);
      setPrintingVehicular(list[0]);
    } else {
      setVehiclePick({ accreditation: a, vehicles: list });
    }
  };

  const eventName = (id) => events.find((e) => e.id === id)?.name || '—';
  const selectedEventName = eventFilter ? eventName(eventFilter) : 'Todos los eventos';

  return (
    <div className="space-y-6">
      <PageHeader kicker="Gestión" title="Personal acreditado">
        <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <Download className="h-4 w-4" /> Exportar Excel
        </button>
      </PageHeader>

      <p className="text-sm text-slate-500 max-w-3xl">
        Listado de las personas acreditadas para el evento. Podés filtrar por estado y editar los datos de acceso.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterSelect
          value={eventFilter}
          onChange={setEventFilter}
          options={eventOptions}
          placeholder="Todos los eventos"
          className="sm:max-w-xs"
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'active', label: 'Autorizados' },
            { value: 'blocked', label: 'Bloqueados' },
            { value: 'revoked', label: 'Revocados' },
          ]}
          placeholder="Todos los estados"
          className="sm:max-w-xs"
        />
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, credencial, documento…" />
      </div>

      <DataTable
        loading={loading}
        isEmpty={rows.length === 0}
        emptyIcon={Users}
        emptyMessage="No hay personal acreditado y autorizado para el filtro seleccionado."
        skeletonCols={7}
      >
        <thead>
          <tr className="border-b border-slate-100">
            <Th>Nombre</Th>
            <Th>Documento</Th>
            <Th>Tipo</Th>
            <Th>Área</Th>
            <Th>Zonas</Th>
            <Th>Días/Fases</Th>
            <Th>Bio</Th>
            <Th>Credencial</Th>
            <Th>Evento</Th>
            <Th>Estado</Th>
            <Th>Credenciales</Th>
            <Th>Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => {
            const p = peopleById[a.person_id] || {};
            return (
              <Tr key={a.id}>
                <Td>
                  <button
                    onClick={() => {
                      const p = peopleById[a.person_id];
                      if (p) setDetailPerson(p);
                    }}
                    className="text-left text-sm font-medium text-slate-800 transition hover:text-emerald-700 hover:underline"
                  >
                    {a.person_name || '—'}
                  </button>
                </Td>
                <Td className="text-slate-600">{p.document || '—'}</Td>
                <Td className="text-slate-600">{a.person_type || '—'}</Td>
                <Td className="text-slate-600">{a.area || '—'}</Td>
                <Td className="text-slate-600">{a.access_level || '—'}</Td>
                <Td className="text-slate-600 text-xs">{phaseLabel(a.event_phases)}</Td>
                <Td>
                  {a.has_biometric ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600"><Fingerprint className="h-3.5 w-3.5" /></span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td className="font-mono text-xs text-slate-700">{a.badge_code || '—'}</Td>
                <Td className="text-slate-600">{a.event_name || '—'}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <StatusBadge status={a.status} />
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${a.delivered_personal ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`grid h-4 w-4 place-items-center rounded-full ${a.delivered_personal ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          {a.delivered_personal ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3 text-slate-300" />}
                        </span>
                        {a.delivered_personal ? 'Entregada' : 'Pendiente'} · Personal
                      </span>
                      {canManageRecords && (
                        <button
                          onClick={() => setPrintingPersonal(a)}
                          title="Imprimir credencial personal"
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Printer className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${a.delivered_vehicular ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`grid h-4 w-4 place-items-center rounded-full ${a.delivered_vehicular ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          {a.delivered_vehicular ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3 text-slate-300" />}
                        </span>
                        {a.delivered_vehicular ? 'Entregada' : 'Pendiente'} · Vehicular
                      </span>
                      {canManageRecords && vehiclePersonIds.has(a.person_id) && (
                        <button
                          onClick={() => handlePrintVehicular(a)}
                          title="Imprimir credencial vehicular"
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Car className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </Td>
                <Td>
                  {canManageRecords ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(a)}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-emerald-700"
                        title="Editar acreditación"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        title="Eliminar acreditación"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

      {!loading && rows.length > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={15} />
      )}

      <p className="text-xs text-slate-400">
        Mostrando {rows.length} {rows.length === 1 ? 'persona' : 'personas'} — {selectedEventName}.
      </p>

      {detailPerson && (
        <PersonDetailModal person={detailPerson} onClose={() => setDetailPerson(null)} readOnly />
      )}

      <AccreditationEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        accreditation={editing}
        events={events}
        onSaved={async () => {
          try {
            const accs = await base44.entities.Accreditation.list('-created_date', 5000);
            setAccreditations(accs);
          } catch {}
        }}
      />

      {printingPersonal && (
        <BadgePrint
          accreditation={printingPersonal}
          event={events.find((e) => e.id === printingPersonal.event_id)}
          printerName={settings?.printer_personal}
          onClose={() => { const id = printingPersonal.id; setPrintingPersonal(null); refreshAccred(id); }}
        />
      )}

      {printingVehicular && (
        <VehicleBadgePrint
          vehicle={printingVehicular}
          settings={settings}
          events={events.filter((e) => printingVehicular.event_ids?.includes(e.id))}
          parkingSectors={sectors}
          accreditationId={vehicularAccredId}
          printerName={settings?.printer_vehicular}
          onClose={() => { const id = vehicularAccredId; setPrintingVehicular(null); setVehicularAccredId(null); if (id) refreshAccred(id); }}
        />
      )}

      {vehiclePick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setVehiclePick(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Elegir vehículo</h3>
            <p className="text-xs text-slate-500">{vehiclePick.accreditation.person_name}</p>
            <div className="mt-3 space-y-2">
              {vehiclePick.vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setVehicularAccredId(vehiclePick.accreditation.id); setPrintingVehicular(v); setVehiclePick(null); }}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{v.brand} {v.model}</p>
                    <span className="font-mono text-xs text-slate-500">{v.plate}</span>
                  </div>
                  <Printer className="h-4 w-4 text-emerald-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}