import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Wine, ArrowRight, AlertCircle, WifiOff } from 'lucide-react';
import { isOnline, loadSession, saveSession, saveCred, verifyCredOffline } from '@/lib/barOffline';

// Busca una sesión guardada localmente cuyo usuario coincida (para login offline).
function findSavedSessionForUser(username) {
  try {
    const u = String(username || '').trim().toLowerCase();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ae_bar_cred_')) {
        const c = JSON.parse(localStorage.getItem(k) || 'null');
        if (c && c.username === u) {
          const barId = k.replace('ae_bar_cred_', '');
          return loadSession(barId);
        }
      }
    }
  } catch {}
  return null;
}

export default function BarApp() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    const u = username.trim();
    if (!u || !password) {
      setLoginError('Ingresá usuario y contraseña.');
      setLoggingIn(false);
      return;
    }

    // Offline: validar contra la credencial guardada en esta tablet.
    if (!isOnline()) {
      const session = findSavedSessionForUser(u);
      const ok = session ? await verifyCredOffline(session.bar_id, u, password) : false;
      if (!ok) {
        setLoginError('Sin conexión y no hay credencial guardada para este usuario en esta tablet. Conectate a internet al menos una vez para habilitar el login offline.');
        setLoggingIn(false);
        return;
      }
      sessionStorage.setItem('ae_bar_active', JSON.stringify(session));
      window.location.href = `/barras/${session.bar_id}?app=bar`;
      return;
    }

    // Online: login contra el backend de credenciales propias.
    try {
      const res = await base44.functions.invoke('barOperatorLogin', { username: u, password });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      const session = data.session;
      if (!session || !session.bar_id) throw new Error('No se pudo iniciar sesión.');
      saveSession(session.bar_id, session);
      await saveCred(session.bar_id, u, password);
      sessionStorage.setItem('ae_bar_active', JSON.stringify(session));
      window.location.href = `/barras/${session.bar_id}?app=bar`;
    } catch (err) {
      setLoginError(err.message || 'Usuario o contraseña incorrectos.');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/40">
            <Wine className="h-9 w-9" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">AccreditEvent · Barras</h1>
          <p className="mt-1 text-sm text-slate-400">Ingresá con tu usuario y contraseña</p>
          <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
            {online ? 'Online' : (<><WifiOff className="h-3 w-3" /> Offline</>)}
          </span>
        </div>
        <form onSubmit={handleLogin} className="allow-lowercase space-y-4">
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
            {loggingIn ? <Loader2 className="h-6 w-6 animate-spin" /> : (<>Entrar <ArrowRight className="h-5 w-5" /></>)}
          </button>
        </form>
      </div>
    </div>
  );
}