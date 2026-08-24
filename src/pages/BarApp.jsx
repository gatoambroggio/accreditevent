import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, Wine, LogOut, ArrowRight, AlertCircle } from 'lucide-react';

// El operador teclea sólo su usuario libre (ej. "B1"); /bar-app lo convierte en
// el email real usando la plantilla configurada en Configuración
// (ej. "barras+{u}@ipx.com.ar" -> "barras+b1@ipx.com.ar") para loguear.
const deriveEmail = (template, username) => {
  const u = (username || '').trim().toLowerCase();
  return (template || '').replace(/\{u\}/g, u);
};

export default function BarApp() {
  const { isAuthenticated, authChecked, user } = useAuth();
  const [bars, setBars] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  // Login inline (sólo usuario + contraseña)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (authChecked && !isAuthenticated) {
      // No forzamos redirect a /login: mostramos el login inline acá mismo.
    }
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke('manageBarOperator', { action: 'getTemplate' });
        const data = res?.data ?? res;
        setTemplate(data?.template || '');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const [b, myUser] = await Promise.all([
          base44.entities.Bar.list('name', 500),
          base44.auth.me().catch(() => null),
        ]);
        setBars((b || []).filter((x) => x.status === 'active'));
        setMe(myUser);
      } catch {}
      setLoading(false);
    })();
  }, [isAuthenticated]);

  const logout = async () => { await base44.auth.logout('/bar-app'); };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    if (!template || !template.includes('{u}')) {
      setLoginError('El sistema no tiene configurado el email de barras. Pedí a un administrador que lo configure.');
      setLoggingIn(false);
      return;
    }
    const email = deriveEmail(template, username);
    if (!email || !email.includes('@')) {
      setLoginError('Ingresá tu usuario.');
      setLoggingIn(false);
      return;
    }
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      // El hard redirect dispara AuthProvider y re-renderiza en sesión.
      window.location.href = '/bar-app';
    } catch (err) {
      setLoginError('Usuario o contraseña incorrectos.');
    } finally {
      setLoggingIn(false);
    }
  };

  // Pantalla de login inline (sin sesión)
  if (authChecked && !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/40">
              <Wine className="h-9 w-9" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">AccreditEvent · Barras</h1>
            <p className="mt-1 text-sm text-slate-400">Ingresá con tu usuario y contraseña</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-300">Usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="ej. barra1"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-4 text-lg font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-300">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-4 text-lg font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
              />
            </label>
            {loginError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /> {loginError}
              </div>
            )}
            <button type="submit" disabled={loggingIn} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-lg font-extrabold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50">
              {loggingIn ? <Loader2 className="h-6 w-6 animate-spin" /> : <>Entrar <ArrowRight className="h-5 w-5" /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!authChecked || (isAuthenticated && loading)) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>;
  }

  // Sesión activa: si es operador barra con barra asignada, ir directo al POS.
  const role = me?.role || user?.role || user?.data?.role;
  const barId = me?.bar_id || user?.bar_id || user?.data?.bar_id;
  if (role === 'barra') {
    if (barId) {
      window.location.href = `/barras/${barId}`;
      return <div className="flex min-h-screen items-center justify-center bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>;
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-amber-400" />
        <h1 className="mt-4 text-xl font-bold text-white">Sin barra asignada</h1>
        <p className="mt-1 text-sm text-slate-400">Tu usuario no tiene una barra asignada. Contactá al administrador.</p>
        <button onClick={logout} className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"><LogOut className="h-4 w-4" /> Salir</button>
      </div>
    );
  }

  // Otros roles: selector de barras (flujo existente)
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