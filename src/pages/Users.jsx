import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { UserPlus, Loader2, ShieldCheck, Pencil } from 'lucide-react';
import EntityModal from '@/components/EntityModal';

const ROLES = [
  { value: 'provider', label: 'Proveedor' },
  { value: 'control', label: 'Control' },
  { value: 'coordinator', label: 'Coordinador' },
  { value: 'admin', label: 'Administrador' },
  { value: 'superadmin', label: 'Superadministrador' },
];

const EDIT_FIELDS = [
  { name: 'role', label: 'Rol', type: 'select', options: ROLES, required: true },
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('provider');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.User.list('-created_date', 200);
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (u) => { setEditing(u); setModalOpen(true); };

  const handleUpdate = async (data) => {
    await base44.entities.User.update(editing.id, { role: data.role });
    await logAudit('update', 'User', editing.id, `Rol: ${data.role}`);
    setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, role: data.role } : u)));
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setError('');
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      await logAudit('invite', 'User', '', `Invitación a ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('user');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo enviar la invitación.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Administración</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Usuarios y roles</h1>
        </div>
        <button onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800">
          <UserPlus className="h-4 w-4" /> Invitar usuario
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nombre</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Email</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Rol</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">{u.full_name || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{u.email}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => openEdit(u)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Invitar usuario</h2>
            <p className="mt-1 text-sm text-slate-500">La persona recibirá un email para unirse al sistema.</p>
            <form onSubmit={handleInvite} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email *</span>
                <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Rol *</span>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  {ROLES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                </select>
              </label>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={inviting} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                  {inviting ? 'Enviando…' : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Editar usuario"
        kicker="EDITAR USUARIO"
        fields={EDIT_FIELDS}
        initialData={editing || {}}
        onSubmit={handleUpdate}
        canDelete={false}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}