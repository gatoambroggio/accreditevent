import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { CheckCircle2, XCircle, Loader2, Radio, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatTimeWithSeconds } from '@/lib/formatDate';

const userEventIdsRef = { current: [] };

const shouldShowLog = (log) => {
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

export default function AccessMonitor() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ granted: 0, denied: 0, total: 0 });
  const [flashId, setFlashId] = useState(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.AccessLog.list('-created_date', 50);
        setLogs(data);
        computeStats(data);
      } catch {}
      setLoading(false);
    })();

    const unsubscribe = base44.entities.AccessLog.subscribe((event) => {
      if (event.type === 'create' && event.data) {
        setLogs((prev) => [event.data, ...prev].slice(0, 50));
        setStats((prev) => ({
          granted: prev.granted + (event.data.result !== 'denied' ? 1 : 0),
          denied: prev.denied + (event.data.result === 'denied' ? 1 : 0),
          total: prev.total + 1,
        }));
        setFlashId(event.data.id);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashId(null), 2000);
      }
    });

    return () => {
      unsubscribe();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [user]);

  const computeStats = (data) => {
    setStats({
      granted: data.filter((l) => l.result !== 'denied').length,
      denied: data.filter((l) => l.result === 'denied').length,
      total: data.length,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Monitoreo</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
            Monitor en tiempo real
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <Radio className="h-3 w-3 animate-pulse" /> EN VIVO
            </span>
          </h1>
        </div>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-emerald-600">{stats.granted}</p>
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
              <p className="text-3xl font-extrabold text-red-600">{stats.denied}</p>
              <p className="text-xs text-slate-500">Accesos denegados</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Total de eventos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live feed */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Radio className="h-4 w-4 animate-pulse text-emerald-600" /> Flujo de accesos
          </h2>
          <span className="text-xs text-slate-400">Actualización automática</span>
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400">Esperando eventos de acceso…</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => {
              const isDenied = log.result === 'denied';
              const isFlash = flashId === log.id;
              return (
                <div
                  key={log.id}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors duration-1000 ${
                    isFlash ? (isDenied ? 'bg-red-50' : 'bg-emerald-50') : ''
                  }`}
                >
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isDenied ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {isDenied ? <XCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{log.person_name || 'Desconocido'}</p>
                    <p className="text-xs text-slate-500">
                      {log.event_name || 'Sin evento'}
                      {log.zone ? ` · ${ZONE_LABELS[log.zone] || log.zone}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                      isDenied
                        ? 'bg-red-50 text-red-700 ring-red-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}>
                      {isDenied ? 'Denegado' : 'Concedido'}
                    </span>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium text-slate-700">{formatTimeWithSeconds(log.created_date)}</p>
                      <p className="text-[10px] text-slate-400">{log.method === 'biometric' ? 'Facial' : 'Manual'}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}