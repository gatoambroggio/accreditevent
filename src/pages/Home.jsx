import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { CalendarDays, Users, IdCard, DoorOpen, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { formatDateTime } from '@/lib/formatDate';
import { getEventStatus, EVENT_STATUS_INFO } from '@/lib/accessUtils';
import StatusBadge from '@/components/StatusBadge';

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ events: 0, people: 0, accreditations: 0, accessToday: 0 });
  const [recentEvents, setRecentEvents] = useState([]);
  const [recentAccess, setRecentAccess] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [events, people, accreditations, accessLogs] = await Promise.all([
          base44.entities.Event.list('-created_date', 5),
          base44.entities.Person.list('-created_date', 1),
          base44.entities.Accreditation.list('-created_date', 1),
          base44.entities.AccessLog.list('-created_date', 5),
        ]);
        setRecentEvents(events);
        setRecentAccess(accessLogs);
        setStats({
          events: events.length,
          people: people.length,
          accreditations: accreditations.length,
          accessToday: accessLogs.filter((l) => {
            const d = new Date(l.created_date);
            const today = new Date();
            return d.toDateString() === today.toDateString();
          }).length,
        });
      } catch {}
      setLoading(false);
    })();
  }, []);

  const statCards = [
    { label: 'Eventos activos', value: stats.events, icon: CalendarDays, color: 'emerald', link: '/events' },
    { label: 'Personas', value: stats.people, icon: Users, color: 'blue', link: '/people' },
    { label: 'Acreditaciones', value: stats.accreditations, icon: IdCard, color: 'amber', link: '/accreditations' },
    { label: 'Accesos hoy', value: stats.accessToday, icon: DoorOpen, color: 'violet', link: '/access-monitor' },
  ];

  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Panel de control</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
          Hola, {user?.full_name?.split(' ')[0] || 'usuario'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Resumen general del sistema de acreditación.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} to={s.link}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[s.color]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900">{loading ? '…' : s.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{s.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">Eventos recientes</h2>
            <Link to="/events" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentEvents.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No hay eventos.</p>
            ) : (
              recentEvents.map((ev) => {
                const status = getEventStatus(ev);
                const info = EVENT_STATUS_INFO[status];
                return (
                  <Link key={ev.id} to="/events" className="flex items-center justify-between px-5 py-3.5 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{ev.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {ev.start_at ? formatDateTime(ev.start_at) : 'Sin fecha'}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${info.cls}`}>
                      {info.label}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-900">Accesos recientes</h2>
            <Link to="/access-monitor" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              Ver monitor <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentAccess.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Sin actividad reciente.</p>
            ) : (
              recentAccess.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{log.person_name || log.badge_code}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {log.event_name} · {formatDateTime(log.created_date)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                    log.result === 'granted'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-red-50 text-red-700 ring-red-200'
                  }`}>
                    {log.result === 'granted' ? 'Permitido' : 'Denegado'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-700 to-emerald-900 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-emerald-300" />
          <h2 className="text-lg font-bold">Acciones rápidas</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/events" className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Nuevo evento
          </Link>
          <Link to="/people" className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Cargar persona
          </Link>
          <Link to="/accreditations" className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Acreditar
          </Link>
          <Link to="/access-control" className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            Control de acceso
          </Link>
        </div>
      </div>
    </div>
  );
}