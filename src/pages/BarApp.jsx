import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Wine, LogOut, ArrowRight } from 'lucide-react';

export default function BarApp() {
  const { isAuthenticated, authChecked } = useAuth();
  const [bars, setBars] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authChecked && !isAuthenticated) {
      window.location.href = '/login?returnTo=/bar-app';
    }
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const [b, user] = await Promise.all([
          base44.entities.Bar.list('name', 500),
          base44.auth.me().catch(() => null),
        ]);
        setBars(b.filter((x) => x.status === 'active'));
        setMe(user);
      } catch {}
      setLoading(false);
    })();
  }, [isAuthenticated]);

  const logout = async () => { await base44.auth.logout('/login'); };

  if (!authChecked || (isAuthenticated && loading)) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>;
  }
  if (!isAuthenticated) return null;

  const byEvent = {};
  for (const b of bars) {
    const key = b.event_name || b.event_id || 'Sin evento';
    if (!byEvent[key]) byEvent[key] = [];
    byEvent[key].push(b);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between bg-slate-900 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white"><Wine className="h-6 w-6" /></span>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white">AccreditEvent · Barras</h1>
            <p className="text-xs text-slate-400">App de barras</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-200">{me?.full_name || me?.email || ''}</span>
          <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"><LogOut className="h-4 w-4" /> Salir</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Elegí una barra</h2>
        {bars.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">No tenés barras asignadas.</div>
        ) : (
          <div className="mt-4 space-y-6">
            {Object.entries(byEvent).map(([ev, list]) => (
              <div key={ev}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{ev}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((b) => (
                    <Link key={b.id} to={`/barras/${b.id}?app=bar`} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:bg-emerald-50">
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Wine className="h-6 w-6" /></span>
                      <div className="flex-1">
                        <p className="text-base font-extrabold text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">{b.sectors?.length ? b.sectors.map((s) => s.label).join(' · ') : 'Sin sector'}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-600" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}