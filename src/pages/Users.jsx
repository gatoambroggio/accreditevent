import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, UserPlus, Trash2, Mail } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import Pagination from '@/components/ui/pagination';
import { usePagination } from '@/lib/usePagination';
import { formatDateTime } from '@/lib/formatDate';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'coordinator', label: 'Coordinador' },
  { value: 'productora', label: 'Productora' },
  { value: 'control', label: 'Control de acceso' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'provider', label: 'Proveedor' },
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.User.list('-created_date', 200);
      setUsers(data);
    } catch {}
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const { page, setPage, totalPages, paginated } = usePagination(filtered, 15);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail, inviteRole);
      setInviteEmail('');
      await loadUsers();
    } catch (err) {
      alert(err.message || 'No se pudo invitar al usuario.');
    }
    setInviting(false);
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await base44.entities.User.update(userId, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Usuarios y roles" />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-900">Invitar usuario</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            <Mail className="h-4 w-4" /> {inviting ? 'Enviando…' : 'Invitar'}
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o email…" />

      <DataTable loading={loading} isEmpty={filtered.length === 0} emptyMessage="No hay usuarios.">
        <thead className="border-b border-slate-100 bg-slate-50/50">
          <tr>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th>Registrado</Th>
            <Th className="text-right">Acciones</Th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((u) => (
            <Tr key={u.id}>
              <Td>
                <p className="font-semibold text-slate-900">{u.full_name || 'Sin nombre'}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </Td>
              <Td>
                <select value={u.role || 'user'} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Td>
              <Td className="text-sm text-slate-600">{formatDateTime(u.created_date)}</Td>
              <Td className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                  u.role === 'admin' || u.role === 'superadmin'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-slate-100 text-slate-600 ring-slate-200'
                }`}>
                  {ROLES.find((r) => r.value === u.role)?.label || u.role}
                </span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={15} />}
    </div>
  );
}