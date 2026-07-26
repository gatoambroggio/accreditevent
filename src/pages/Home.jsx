import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, CalendarDays, IdCard, DoorOpen, TrendingUp, Download, Loader2 } from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
          <p className="text-xs text-slate-400">{sub}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [stats, setStats] = useState({ people: 0, events: 0, accreditations: 0, accesses: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [people, events, accreds, logs] = await Promise.all([
          base44.entities.Person.list('-created_date', 500),
          base44.entities.Event.list('-created_date', 500),
          base44.entities.Accreditation.filter({ status: 'active' }, '-created_date', 500),
          base44.entities.AccessLog.list('-created_date', 12),
        ]);
        const today = new Date().toDateString();
        setStats({
          people: people.length,
          events: events.length,
          accreditations: accreds.length,
          accesses: logs.filter((l) => new Date(l.created_date).toDateString() === today).length,
        });
        setRecent(logs);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const accreds = await base44.entities.Accreditation.list('-created_date', 2000);
      const headers = ['Persona', 'Tipo', 'Evento', 'Código', 'Área', 'Nivel de acceso', 'Estado', 'Biometría'];
      const rows = accreds.map((a) => [
        a.person_name || '',
        a.person_type || '',
        a.event_name || '',
        a.badge_code || '',
        a.area || '',
        a.access_level || '',
        a.status || '',
        a.has_biometric ? 'Sí' : 'No',
      ]);
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `acreditados_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Panel administrativo</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Resumen</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exportando…' : 'Exportar acreditados'}
        </button>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-8 sm:p-10">
        <div className="relative z-10 max-w-lg">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Operación en tiempo real</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            Control total<br />de tu evento.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100">
            Gestioná personas, acreditaciones, permisos y accesos de todo tu equipo desde un solo lugar.
          </p>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden h-32 w-32 rounded-full border-[20px] border-emerald-500/30 sm:block" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Personas" value={loading ? '—' : stats.people} sub="en directorio" color="bg-emerald-50 text-emerald-700" />
        <StatCard icon={CalendarDays} label="Eventos" value={loading ? '—' : stats.events} sub="registrados" color="bg-amber-50 text-amber-700" />
        <StatCard icon={IdCard} label="Acreditaciones" value={loading ? '—' : stats.accreditations} sub="activas" color="bg-emerald-50 text-emerald-700" />
        <StatCard icon={DoorOpen} label="Accesos hoy" value={loading ? '—' : stats.accesses} sub="validados hoy" color="bg-slate-100 text-slate-700" />
      </div>

      {/* Recent accesses */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Ingresos recientes</h3>
          <TrendingUp className="h-4 w-4 text-slate-400" />
        </div>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Todavía no hay ingresos registrados.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((log) => (
              <div key={log.id} className="flex items-center justify-between border-t border-slate-100 py-3 first:border-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{log.person_name || '—'}</p>
                  <p className="text-xs text-slate-400">{log.event_name} · {log.badge_code}</p>
                </div>
                <time className="font-mono text-xs text-slate-400">
                  {new Date(log.created_date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}