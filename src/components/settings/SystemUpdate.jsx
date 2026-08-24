import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Upload, GitBranch, RotateCcw, RefreshCw, CheckCircle2, XCircle, Clock, Package, History } from 'lucide-react';

const API = '/api/updates';

function authHeaders() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ae_access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function SystemUpdate() {
  const [state, setState] = useState(null);
  const [version, setVersion] = useState('—');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [backups, setBackups] = useState([]);
  const [polling, setPolling] = useState(false);
  const logRef = useRef(null);
  const fileRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`, { headers: authHeaders() });
      const data = await res.json();
      const s = data?.data?.state || null;
      setState(s);
      setVersion(data?.data?.currentVersion || '—');
      if (s?.status === 'running') setPolling(true);
      else setPolling(false);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetch(`${API}/backups`, { headers: authHeaders() }).then((r) => r.json()).then((d) => setBackups(d?.data?.backups || [])).catch(() => {});
  }, [fetchStatus]);

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(fetchStatus, 3000);
    return () => clearInterval(t);
  }, [polling, fetchStatus]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state?.log]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Se va a actualizar el sistema completo (backup automático + recompilación + reinicio). ¿Continuar?')) {
      e.target.value = '';
      return;
    }
    setBusy(true);
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/zip' },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falló la subida');
      setPolling(true);
      fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleGitPull = async () => {
    if (!gitUrl.trim()) return;
    if (!confirm('Se clonará el repo y se aplicará como actualización. ¿Continuar?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/git-pull`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ git_url: gitUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falló el pull');
      setPolling(true);
      fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (backupFile) => {
    if (!confirm('Se revierte el sistema al backup seleccionado. ¿Continuar?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/revert`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupFile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falló la reversión');
      setPolling(true);
      fetchStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const refreshBackups = async () => {
    const r = await fetch(`${API}/backups`, { headers: authHeaders() }).catch(() => null);
    if (r) { const d = await r.json(); setBackups(d?.data?.backups || []); }
  };

  const running = state?.status === 'running';
  const failed = state?.status === 'failed';
  const completed = state?.status === 'completed';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Actualización del sistema</h2>
          <p className="mt-0.5 text-xs text-slate-500">Subí un ZIP con el nuevo código o hacé pull desde un Git de la LAN. El servidor respalda, recompila y reinicia solo.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Package className="h-4 w-4 text-emerald-600" />
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Versión actual</p>
            <p className="text-sm font-bold text-slate-900">{version}</p>
          </div>
        </div>
      </div>

      {/* Estado */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {running && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Actualizando… {state?.lastStep}
          </span>
        )}
        {completed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> Actualización completada {state?.version && state.version !== version ? `(reiniciando a ${state.version})` : ''}
          </span>
        )}
        {failed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
            <XCircle className="h-3.5 w-3.5" /> Falló: {state?.error}
          </span>
        )}
        {!running && !completed && !failed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
            <Clock className="h-3.5 w-3.5" /> Listo para actualizar
          </span>
        )}
        {polling && <span className="text-xs text-slate-400">Actualizando log cada 3s…</span>}
      </div>

      {/* Acciones */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-700">Subir paquete (ZIP)</p>
          <p className="mt-0.5 text-xs text-slate-500">ZIP con la raíz del repositorio (server/, src/, package.json…). No incluye .env ni uploads.</p>
          <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || running}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? 'Procesando…' : 'Seleccionar ZIP y actualizar'}
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-700">Pull desde Git interno (LAN)</p>
          <p className="mt-0.5 text-xs text-slate-500">URL de un repo accesible dentro de la LAN (ej. http://git.local/accreditevent.git).</p>
          <div className="mt-3 flex gap-2">
            <input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="http://git.local/accreditevent.git"
              className="normal-case flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              onClick={handleGitPull}
              disabled={busy || running || !gitUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <GitBranch className="h-4 w-4" /> Pull
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

      {/* Log en vivo */}
      {state?.log?.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-slate-600">Registro de la última actualización</p>
          <div ref={logRef} className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs">
            {state.log.map((l, i) => (
              <div key={i} className={`flex gap-2 ${l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-300' : 'text-emerald-200'}`}>
                <span className="shrink-0 text-slate-500">{new Date(l.t).toLocaleTimeString()}</span>
                <span className="whitespace-pre-wrap break-words">{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backups / revertir */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600"><History className="mr-1 inline h-3.5 w-3.5 text-slate-400" />Backups disponibles</p>
        <button onClick={refreshBackups} className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline">
          <RefreshCw className="h-3 w-3" /> Refrescar
        </button>
      </div>
      {backups.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">Aún no hay backups. Se generan automáticamente al actualizar.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {backups.slice(0, 6).map((b) => (
            <div key={b.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-700">{b.name}</p>
                <p className="text-slate-400">{new Date(b.mtime).toLocaleString()} · {fmtBytes(b.size)}</p>
              </div>
              <button
                onClick={() => handleRevert(b.name)}
                disabled={busy || running}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Revertir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}