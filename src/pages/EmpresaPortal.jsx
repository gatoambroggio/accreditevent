import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Building2, Plus, Upload, LogOut, Users, CalendarDays, FileSpreadsheet } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import StatusBadge from '@/components/StatusBadge';
import { exportToExcel } from '@/lib/exportUtils';
import { getUserCompany } from '@/lib/userCompany';
import { useZones } from '@/lib/useZones';

const PHASE_OPTIONS = [
  { value: 'armado', label: 'Armado' },
  { value: 'dia_evento', label: 'Show' },
  { value: 'desarme', label: 'Desarme' },
];

const EMPLOYMENT_OPTIONS = [
  { value: 'fijo', label: 'Fijo' },
  { value: 'eventual', label: 'Eventual' },
];

export default function EmpresaPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('employees');
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const { zones } = useZones();
  const companyName = getUserCompany(user);

  useEffect(() => {
    (async () => {
      try {
        const [ps, evs] = await Promise.all([
          base44.entities.Person.filter({ company: companyName }, '-created_date', 200),
          base44.entities.EventCompanyApproval.filter({ provider_company: companyName }, '-created_date', 50),
        ]);
        setPeople(ps);
        // Fetch approved events
        const approved = evs.filter((e) => e.status === 'approved');
        const eventDetails = await Promise.all(approved.map((a) => base44.entities.Event.get(a.event_id).catch(() => null)));
        setEvents(eventDetails.filter(Boolean));
      } catch {}
      setLoading(false);
    })();
  }, [user, companyName]);

  const fields = [
    { name: 'full_name', label: 'Nombre completo', required: true },
    { name: 'document', label: 'DNI', type: 'dni' },
    { name: 'phone', label: 'Teléfono', type: 'phone-ar' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'access_area', label: 'Área de acceso', type: 'select', options: zones.map((z) => ({ value: z.value, label: z.label })) },
    { name: 'employment_type', label: 'Tipo de contratación', type: 'select', options: EMPLOYMENT_OPTIONS, defaultValue: 'fijo' },
    { name: 'event_id', label: 'Evento', type: 'searchable-select', full: true, options: events.map((e) => ({ value: e.id, label: e.name })) },
    { name: 'event_phases', label: 'Fases del evento', type: 'toggle-group', full: true, options: PHASE_OPTIONS },
  ];

  const handleSubmit = async (data) => {
    const personData = {
      ...data,
      company: companyName,
      person_type: data.access_area || 'general',
      status: 'pending',
    };
    const evt = events.find((e) => e.id === data.event_id);
    if (evt) {
      personData.event_ids = [evt.id];
      personData.event_names = [evt.name];
      personData.productora = evt.company;
    }
    if (editing) {
      await base44.entities.Person.update(editing.id, personData);
    } else {
      await base44.entities.Person.create(personData);
    }
    const ps = await base44.entities.Person.filter({ company: companyName }, '-created_date', 200);
    setPeople(ps);
  };

  const handleExport = () => {
    const headers = ['Nombre', 'DNI', 'Email', 'Área', 'Estado'];
    const rows = people.map((p) => [p.full_name, p.document, p.email, p.access_area, p.status]);
    exportToExcel(headers, rows, 'empleados');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-emerald-400" />
            <div>
              <p className="font-bold">{companyName || user?.full_name}</p>
              <p className="text-xs text-slate-400">Portal de empresa</p>
            </div>
          </div>
          <button onClick={() => logout()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20">
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 space-y-6">
        <div className="flex gap-2 border-b border-slate-200">
          {[
            { key: 'employees', label: 'Empleados', icon: Users },
            { key: 'events', label: 'Eventos asignados', icon: CalendarDays },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition ${
                  tab === t.key ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'employees' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{people.length} empleados cargados</p>
              <div className="flex gap-2">
                <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  <FileSpreadsheet className="h-4 w-4" /> Exportar
                </button>
                <button onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                  <Plus className="h-4 w-4" /> Nuevo empleado
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left">
                <thead className="border-b border-slate-100 bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nombre</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">DNI</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Área</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.full_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.document || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{zones.find((z) => z.value === p.access_area)?.label || p.access_area || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {people.length === 0 && <p className="py-12 text-center text-sm text-slate-400">No hay empleados cargados.</p>}
            </div>
          </div>
        )}

        {tab === 'events' && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No tenés eventos asignados todavía.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="font-bold text-slate-900">{ev.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{ev.venue || 'Sin sede'}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? editing.full_name : 'Nuevo empleado'}
        kicker={editing ? 'EDITAR EMPLEADO' : 'CREAR EMPLEADO'}
        fields={fields}
        initialData={editing || { status: 'pending', employment_type: 'fijo' }}
        onSubmit={handleSubmit}
        canDelete={!!editing}
        onDelete={async () => { await base44.entities.Person.delete(editing.id); const ps = await base44.entities.Person.filter({ company: companyName }, '-created_date', 200); setPeople(ps); }}
        submitLabel={editing ? 'Guardar' : 'Crear'}
      />
    </div>
  );
}