import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ScrollText } from 'lucide-react';

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.AuditLog.list('-created_date', 100);
        setLogs(data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Trazabilidad</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Auditoría</h1>
        </div>
        <ScrollText className="h-5 w-5 text-slate-300" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : logs.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay registros de auditoría.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Fecha</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Usuario</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Acción</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Entidad</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
                      {new Date(a.created_date).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{a.actor_name || 'Sistema'}</td>
                    <td className="px-4 py-3.5">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{a.action}</code>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{a.entity}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-400">{a.detail || '—'}</td>
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