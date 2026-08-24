import React, { useState, useEffect } from 'react';
import { Loader2, X, KeyRound, Wine } from 'lucide-react';

export default function BarOperatorModal({ open, onClose, onSaved, bars, editing }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [barId, setBarId] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [changePw, setChangePw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setUsername(editing.username || '');
      setFullName(editing.full_name && editing.full_name !== editing.username ? editing.full_name : '');
      setPassword('');
      setBarId(editing.bar_id || '');
      setBlocked(!!editing.blocked);
      setChangePw(false);
    } else {
      setUsername('');
      setFullName('');
      setPassword('');
      setBarId(bars[0]?.id || '');
      setBlocked(false);
      setChangePw(false);
    }
    setError('');
  }, [open, editing, bars]);

  if (!open) return null;

  const genPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let p = '';
    for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!barId) { setError('Elegí una barra'); return; }
    if (!editing) {
      if (!username || !password) { setError('Usuario y contraseña son obligatorios'); return; }
      if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    }
    if (changePw && password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setSaving(true);
    try {
      await onSaved({
        editing: !!editing,
        id: editing?.id,
        username: username.trim(),
        full_name: fullName.trim(),
        password,
        bar_id: barId,
        blocked,
        changePw,
      });
    } catch (err) {
      setError(err.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Wine className="h-5 w-5" /></span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{editing ? 'Editar operador' : 'Nuevo operador de barra'}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">
          {editing ? 'Modificá la barra asignada, el bloqueo o la clave del operador.' : 'El operador se loguea en la tablet sólo con usuario y contraseña. No se envía ningún email.'}
        </p>

        <form onSubmit={handleSubmit} className="allow-lowercase mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Usuario *</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!!editing}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="ej. barra1"
              className="normal-case w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {editing && <span className="mt-1 block text-[11px] text-slate-400">El usuario no se puede cambiar.</span>}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre visible (opcional)</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ej. Juan Pérez"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Barra asignada *</span>
            <select value={barId} onChange={(e) => setBarId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
              <option value="">Elegí una barra…</option>
              {bars.map((b) => <option key={b.id} value={b.id}>{b.name}{b.event_name ? ` · ${b.event_name}` : ''}</option>)}
            </select>
          </label>

          {editing ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={changePw} onChange={(e) => setChangePw(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Cambiar contraseña</span>
              </label>
              {changePw && (
                <div className="mt-2 flex items-center gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="normal-case flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                  <button type="button" onClick={genPassword} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><KeyRound className="h-3.5 w-3.5" /> Generar</button>
                </div>
              )}
              <label className="mt-3 flex items-center gap-2">
                <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Bloqueado (sin acceso)</span>
              </label>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Contraseña *</span>
              <div className="flex items-center gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="normal-case flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                <button type="button" onClick={genPassword} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"><KeyRound className="h-3.5 w-3.5" /> Generar</button>
              </div>
            </label>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}