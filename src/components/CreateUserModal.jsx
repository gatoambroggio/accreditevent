import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, X, KeyRound, Copy, ShieldCheck } from 'lucide-react';

// Módulos PDA por defecto: control de acceso + sus modos, PDA ID y emergencia.
const PDA_DEFAULT_PATHS = ['/access-control', '/control-qr', '/control-vehicular', '/control-manual', '/pda-id', '/emergency-scan'];

export default function CreateUserModal({ open, onClose, onCreated, events, availableRoles, moduleOptions }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('pda');
  const [company, setCompany] = useState('');
  const [assignedEventIds, setAssignedEventIds] = useState([]);
  const [allowedPaths, setAllowedPaths] = useState(PDA_DEFAULT_PATHS);
  const [useTempPassword, setUseTempPassword] = useState(true);
  const [tempPassword, setTempPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  if (!open) return null;

  const onRoleChange = (r) => {
    setRole(r);
    setAllowedPaths(r === 'pda' ? PDA_DEFAULT_PATHS : []);
  };

  const toggle = (list, setList, val) => {
    setList(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  };

  const genPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let p = '';
    for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setTempPassword(p);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(null);
    try {
      const payload = {
        email: email.trim().toLowerCase(),
        role,
        full_name: fullName.trim(),
        company: company.trim(),
        assigned_event_ids: assignedEventIds,
        allowed_paths: allowedPaths,
        setTempPassword: useTempPassword,
        tempPassword: useTempPassword ? tempPassword : '',
      };
      const res = await base44.functions.invoke('createUser', payload);
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      setSuccess({
        pending: data.pending,
        email: payload.email,
        tempPassword: useTempPassword && !data.passwordWarning ? tempPassword : '',
        warning: data.passwordWarning || data.message || '',
      });
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message || 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFullName('');
    setEmail('');
    setRole('pda');
    setCompany('');
    setAssignedEventIds([]);
    setAllowedPaths(PDA_DEFAULT_PATHS);
    setUseTempPassword(true);
    setTempPassword('');
    setError('');
    setSuccess(null);
  };

  const close = () => { reset(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Crear usuario</h2>
          </div>
          <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">
          Alta directa con datos completos. Se envía un email de invitación y, si lo activás, una contraseña temporal para entrar ya.
        </p>

        {success ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {success.pending
                ? `La invitación fue enviada a ${success.email}. El usuario debe completar su registro desde el email.`
                : `Usuario creado: ${success.email}`}
            </div>
            {success.tempPassword && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-600">Contraseña temporal</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-900 ring-1 ring-slate-200">{success.tempPassword}</code>
                  <button onClick={() => navigator.clipboard.writeText(success.tempPassword)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Compartila con el operador. La pedirá al entrar por primera vez.</p>
              </div>
            )}
            {success.warning && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{success.warning}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={close} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Listo</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre</span>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email *</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Rol *</span>
                <select value={role} onChange={(e) => onRoleChange(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  {availableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Empresa</span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Productora" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Eventos asignados</span>
              <div className="flex flex-wrap gap-1.5">
                {events.length === 0 && <span className="text-xs text-slate-400">Sin eventos cargados.</span>}
                {events.map((ev) => {
                  const active = assignedEventIds.includes(ev.id);
                  return (
                    <button type="button" key={ev.id} onClick={() => toggle(assignedEventIds, setAssignedEventIds, ev.id)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{ev.name}</button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Módulos permitidos</span>
              {role === 'pda' && <p className="mb-1.5 text-[11px] text-slate-400">Por defecto un PDA ve Control de acceso, PDA ID y Emergencia.</p>}
              <div className="flex flex-wrap gap-1.5">
                {moduleOptions.map((m) => {
                  const active = allowedPaths.includes(m.value);
                  return (
                    <button type="button" key={m.value} onClick={() => toggle(allowedPaths, setAllowedPaths, m.value)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{m.label}</button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useTempPassword} onChange={(e) => setUseTempPassword(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Setear contraseña temporal</span>
              </label>
              {useTempPassword && (
                <div className="mt-2 flex items-center gap-2">
                  <input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                  <button type="button" onClick={genPassword} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><KeyRound className="h-3.5 w-3.5" /> Generar</button>
                </div>
              )}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</> : 'Crear usuario'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}