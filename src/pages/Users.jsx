import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { UserPlus, Loader2, Pencil, KeyRound, Building2, ShieldCheck, Ban, Link2 } from 'lucide-react';
import EntityModal from '@/components/EntityModal';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnIcon } from '@/components/ui/button-styles';
import { slugify } from '@/lib/slugify';

const ROLES = [
  { value: 'provider', label: 'Proveedor' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'control', label: 'Control' },
  { value: 'operador', label: 'Operador' },
  { value: 'coordinator', label: 'Coordinador' },
  { value: 'admin', label: 'Administrador' },
  { value: 'superadmin', label: 'Superadministrador' },
  { value: 'productora', label: 'Productora' },
];

const MODULE_OPTIONS = [
  { value: '/', label: 'Resumen' },
  { value: '/accreditations', label: 'Acreditaciones' },
  { value: '/accreditation-facial', label: 'Acreditación facial' },
  { value: '/dni-scan', label: 'Escaneo de DNI' },
  { value: '/access-control', label: 'Control de acceso' },
  { value: '/emergency-scan', label: 'Escaneo de emergencia' },
  { value: '/access-monitor', label: 'Monitor en vivo' },
  { value: '/vehicles', label: 'Vehículos acreditados' },
  { value: '/parking-sectors', label: 'Sectores de estacionamiento' },
  { value: '/parking-capacities', label: 'Capacidades por evento' },
  { value: '/documents', label: 'Documentos' },
  { value: '/people', label: 'Personal de Empresas' },
  { value: '/personas-autonomas', label: 'Personas Autónomas' },
  { value: '/registered-people', label: 'Personas registradas' },
  { value: '/reports', label: 'Reportes' },
];

const ROLE_LABELS = {
  productora: 'Productora',
  superadmin: 'Superadmin',
  admin: 'Administrador',
  coordinator: 'Coordinador',
  control: 'Control',
  operador: 'Operador',
  provider: 'Proveedor',
  empresa: 'Empresa',
};

const ROLE_STYLES = {
  productora: 'bg-amber-50 text-amber-800 ring-amber-300',
  superadmin: 'bg-purple-50 text-purple-700 ring-purple-200',
  admin: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  coordinator: 'bg-blue-50 text-blue-700 ring-blue-200',
  control: 'bg-amber-50 text-amber-700 ring-amber-200',
  operador: 'bg-teal-50 text-teal-700 ring-teal-200',
  provider: 'bg-slate-100 text-slate-600 ring-slate-200',
  empresa: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
};

export default function Users() {
  const { user: currentUser } = useAuth();
  const isProductora = currentUser?.role === 'productora';
  const myCompany = currentUser?.company || currentUser?.data?.company || '';
  const [users, setUsers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('provider');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  const availableRoles = isProductora ? ROLES.filter((r) => r.value === 'operador') : ROLES;
  const canManageUser = (u) => {
    if (!u) return false;
    if (u.id === currentUser?.id) return false;
    if (isProductora) return u.role === 'operador' && (u.company || '') === myCompany;
    return true;
  };

  const load = async () => {
    setLoading(true);
    try {
      if (isProductora && myCompany) {
        const res = await base44.functions.invoke('getCompanyOperators');
        if (res.data?.error) throw new Error(res.data.error);
        setUsers(res.data.operators || []);
        setPendingInvites(res.data.pending || []);
      } else {
        const data = await base44.entities.User.list('-created_date', 200);
        setUsers(data || []);
        setPendingInvites([]);
      }
    } catch (err) {
      setError(err.message || 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    base44.entities.Event.list('-start_at', 200).then(setEvents).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter((u) =>
      `${u.full_name || ''} ${u.email || ''} ${u.company || ''} ${u.role || ''}`.toLowerCase().includes(q)
    );
  }, [users, search]);

  const fields = useMemo(() => [
    ...(isProductora ? [] : [{ name: 'company', label: 'Empresa', type: 'text', placeholder: 'Ej: Producciones SA', full: true }]),
    { name: 'role', label: 'Rol', type: 'select', options: availableRoles, required: true },
    {
      name: 'assigned_event_ids', label: 'Eventos asignados', type: 'toggle-group',
      options: events.map((e) => ({ value: e.id, label: e.name })),
      full: true, hint: 'Eventos a los que este usuario tiene acceso (operadores).',
    },
    {
      name: 'allowed_paths', label: 'Módulos permitidos', type: 'toggle-group',
      options: MODULE_OPTIONS, full: true, hint: 'Si seleccionás módulos, el usuario solo verá esos. Vacío = sin restricción.',
    },
    { name: 'blocked', label: 'Bloqueado (sin acceso al sistema)', type: 'checkbox' },
    { name: 'password', label: 'Nueva contraseña', type: 'password', placeholder: 'Dejar en blanco para no cambiar', full: true, hint: 'Mínimo 6 caracteres' },
  ], [events, availableRoles]);

  const openEdit = (u) => { setEditing(u); setModalOpen(true); setResetMsg(''); };

  const syncUserCompany = async (userId, oldCompany, newCompany) => {
    if ((oldCompany || '').toLowerCase() === (newCompany || '').toLowerCase()) return;
    if (oldCompany) {
      const oldComps = await base44.entities.Company.filter({ name: oldCompany });
      for (const c of oldComps) {
        const newIds = (c.assigned_user_ids || []).filter((id) => id !== userId);
        await base44.entities.Company.update(c.id, { assigned_user_ids: newIds });
      }
    }
    if (newCompany) {
      const existing = await base44.entities.Company.filter({ name: newCompany });
      if (existing.length > 0) {
        const c = existing[0];
        const merged = [...new Set([...(c.assigned_user_ids || []), userId])];
        await base44.entities.Company.update(c.id, { assigned_user_ids: merged });
      } else {
        await base44.entities.Company.create({ name: newCompany, slug: slugify(newCompany), assigned_user_ids: [userId] });
      }
    }
  };

  const handleUpdate = async (data) => {
    if (data.password) {
      try {
        await base44.functions.invoke('changeUserPassword', { userId: editing.id, newPassword: data.password });
        await logAudit('change_password', 'User', editing.id, 'Cambio manual de contraseña');
      } catch (err) {
        throw new Error('No se pudo cambiar la contraseña: ' + (err.data?.error || err.message || err));
      }
    }
    const oldCompany = editing.company || '';
    const newCompany = isProductora ? (editing.company || myCompany) : (data.company || '');
    const assignedEventIds = typeof data.assigned_event_ids === 'string'
      ? data.assigned_event_ids.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(data.assigned_event_ids) ? data.assigned_event_ids : []);
    const allowedPaths = typeof data.allowed_paths === 'string'
      ? data.allowed_paths.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(data.allowed_paths) ? data.allowed_paths : []);
    await base44.entities.User.update(editing.id, { role: data.role, company: newCompany, assigned_event_ids: assignedEventIds, allowed_paths: allowedPaths, blocked: !!data.blocked });
    await syncUserCompany(editing.id, oldCompany, newCompany);
    await logAudit('update', 'User', editing.id, `Rol: ${data.role}, Empresa: ${newCompany || '—'}`);
    setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, role: data.role, company: newCompany, assigned_event_ids: assignedEventIds, allowed_paths: allowedPaths, blocked: !!data.blocked } : u)));
  };

  const handleToggleBlock = async (u) => {
    try {
      await base44.entities.User.update(u.id, { blocked: !u.blocked });
      await logAudit(!u.blocked ? 'block-user' : 'unblock-user', 'User', u.id, !u.blocked ? 'Bloqueado' : 'Desbloqueado');
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, blocked: !u.blocked } : x)));
    } catch (err) {
      alert('No se pudo actualizar: ' + (err.message || err));
    }
  };

  const handleDelete = async () => {
    await base44.entities.User.delete(editing.id);
    await logAudit('delete', 'User', editing.id, `Email: ${editing.email}`);
    setUsers((prev) => prev.filter((u) => u.id !== editing.id));
  };

  const handleResetPassword = async () => {
    if (!editing?.email) return;
    if (!window.confirm(`¿Enviar email de reseteo de contraseña a ${editing.email}?`)) return;
    setResetting(true);
    setResetMsg('');
    try {
      await base44.auth.resetPasswordRequest(editing.email);
      setResetMsg(`Se envió un email de reseteo a ${editing.email}.`);
      await logAudit('reset_password', 'User', editing.id, `Email: ${editing.email}`);
    } catch {
      setResetMsg('No se pudo enviar el email de reseteo.');
    } finally {
      setResetting(false);
    }
  };

  const handleResetPasswordRow = async (u) => {
    if (!u?.email) return;
    if (!window.confirm(`¿Enviar email de reseteo de contraseña a ${u.email}?`)) return;
    try {
      await base44.auth.resetPasswordRequest(u.email);
      await logAudit('reset_password', 'User', u.id, `Email: ${u.email}`);
      alert(`Se envió un email de reseteo a ${u.email}.`);
    } catch {
      alert('No se pudo enviar el email de reseteo.');
    }
  };

  const copyInviteLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copiado al portapapeles.');
    } catch {
      window.prompt('Copiá este link:', url);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviting(true);
    setError('');
    try {
      if (isProductora) {
        const res = await base44.functions.invoke('assignOperator', { email: inviteEmail });
        if (res.data?.error) throw new Error(res.data.error);
        const link = res.data?.invite_url || '';
        if (res.data?.pending) {
          const msg = res.data.message || 'La invitación fue enviada. El operador quedará vinculado a tu empresa al completar su registro.';
          alert(link ? `${msg}\n\nLink para compartir:\n${link}` : msg);
        }
        await logAudit('invite-operator', 'User', '', `Operador invitado: ${inviteEmail}`);
      } else {
        await base44.users.inviteUser(inviteEmail, inviteRole);
        await logAudit('invite', 'User', '', `Invitación a ${inviteEmail} (${inviteRole})`);
      }
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('provider');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo enviar la invitación.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Usuarios y roles">
        <button onClick={() => { setInviteOpen(true); if (isProductora) setInviteRole('operador'); }} className={btnPrimary}>
          <UserPlus className="h-4 w-4" /> {isProductora ? 'Asignar operador' : 'Invitar usuario'}
        </button>
      </PageHeader>

      <div className="max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, email o empresa…" />
      </div>

      {isProductora && pendingInvites.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Invitaciones pendientes ({pendingInvites.length})</h3>
          <p className="mt-0.5 text-xs text-amber-700">Personas que aún no completaron su registro. Copiá el link y compartilo por el medio que prefieras.</p>
          <div className="mt-3 space-y-2">
            {pendingInvites.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{p.email}</p>
                  {p.invite_url ? (
                    <p className="mt-0.5 truncate text-xs text-slate-400">{p.invite_url}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-400">Sin link generado</p>
                  )}
                </div>
                {p.invite_url && (
                  <button type="button" onClick={() => copyInviteLink(p.invite_url)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
                    <Link2 className="h-3.5 w-3.5" /> Copiar link
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyMessage={search ? 'No se encontraron usuarios.' : 'No hay usuarios registrados.'}
        tableClassName="min-w-[720px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Nombre</Th>
            <Th>Email</Th>
            <Th>Empresa</Th>
            <Th>Rol</Th>
            <Th>Eventos</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => {
            const roleStyle = ROLE_STYLES[u.role] || ROLE_STYLES.provider;
            const roleLabel = ROLE_LABELS[u.role] || u.role;
            const eventCount = u.assigned_event_ids?.length || 0;
            return (
              <Tr key={u.id}>
                <Td className="text-sm font-semibold text-slate-900">{u.full_name || '—'}</Td>
                <Td className="text-sm text-slate-500">{u.email}</Td>
                <Td className="text-sm text-slate-600">
                  {u.company ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" /> {u.company}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${roleStyle}`}>
                    <ShieldCheck className="h-3 w-3" /> {roleLabel}
                  </span>
                  {u.blocked && (
                    <span className="mt-1 inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">Bloqueado</span>
                  )}
                </Td>
                <Td className="text-sm text-slate-500">
                  {eventCount > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{eventCount}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="inline-flex items-center gap-1">
                    {canManageUser(u) && (
                      <button onClick={() => handleToggleBlock(u)} title={u.blocked ? 'Desbloquear' : 'Bloquear'}
                        className={`rounded-md border p-1.5 transition ${u.blocked ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-slate-200 bg-white text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canManageUser(u) && (
                      <button onClick={() => handleResetPasswordRow(u)} title="Reseteo de contraseña"
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-amber-600">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canManageUser(u) && (
                      <button onClick={() => openEdit(u)} title="Editar" className={btnIcon}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

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
              {!isProductora && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Rol *</span>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                    {availableRoles.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
                  </select>
                </label>
              )}
              {isProductora && (
                <p className="text-xs text-slate-500">La persona recibirá un email para registrarse como <strong>operador</strong> de tu productora y quedará vinculada a tu empresa.</p>
              )}
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
        title={editing?.full_name || editing?.email || 'Editar usuario'}
        kicker="EDITAR USUARIO"
        fields={fields}
        initialData={editing || {}}
        onSubmit={handleUpdate}
        onDelete={editing ? handleDelete : null}
        canDelete={!!editing && canManageUser(editing)}
        submitLabel="Guardar cambios"
        topContent={
          editing?.email ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Enviar email de reseteo de contraseña
              </button>
              {resetMsg && <p className="text-center text-xs text-emerald-600">{resetMsg}</p>}
            </div>
          ) : null
        }
      />
    </div>
  );
}