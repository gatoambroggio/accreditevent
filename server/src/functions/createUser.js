import { hashPassword } from '../auth/bcrypt.js';

const PDA_DEFAULT_PATHS = ['/access-control', '/control-qr', '/control-vehicular', '/control-manual', '/pda-id', '/emergency-scan'];

export async function createUser(body, { user, prisma }) {
  if (!['superadmin', 'admin'].includes(user.role)) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const email = (body.email || '').toString().trim().toLowerCase();
  const newRole = (body.role || 'user').toString();
  const fullName = (body.full_name || '').toString().trim();
  const company = (body.company || '').toString().trim().toUpperCase();
  const assigned_event_ids = Array.isArray(body.assigned_event_ids) ? body.assigned_event_ids : [];
  let allowed_paths = Array.isArray(body.allowed_paths) ? body.allowed_paths : [];
  if (newRole === 'pda' && allowed_paths.length === 0) allowed_paths = PDA_DEFAULT_PATHS;
  const setTempPassword = !!body.setTempPassword;
  const tempPassword = (body.tempPassword || '').toString();
  if (!email) throw Object.assign(new Error('Email requerido'), { status: 400 });
  if (setTempPassword && tempPassword.length < 6) throw Object.assign(new Error('La contraseña temporal debe tener al menos 6 caracteres'), { status: 400 });

  const existing = await prisma.user.findMany({ where: { email } });
  if (existing.length) {
    const target = existing[0];
    if (['productora', 'admin', 'superadmin'].includes(target.role)) throw Object.assign(new Error('Ya existe un usuario con ese email y tiene un rol superior. Editálo desde la lista.'), { status: 400 });
    const data = { role: newRole, data: { ...((target.data && typeof target.data === 'object') ? target.data : {}), company, assigned_event_ids, allowed_paths } };
    if (fullName) data.full_name = fullName;
    await prisma.user.update({ where: { id: target.id }, data });
    let passwordWarning = '';
    if (setTempPassword && tempPassword.length >= 6) {
      try { await prisma.user.update({ where: { id: target.id }, data: { password_hash: hashPassword(tempPassword) } }); }
      catch (e) { passwordWarning = 'No se pudo setear la contraseña temporal.'; }
    }
    if (company) await linkCompany(prisma, target.id, company);
    return { ok: true, pending: false, user: { id: target.id, email, role: newRole, company }, passwordWarning };
  }

  // No existe: crear directamente con temp password (air-gap: no hay invitación por email)
  const passwordHash = hashPassword(setTempPassword ? tempPassword : (body.tempPassword || 'cambiar123'));
  const created = await prisma.user.create({ data: { email, password_hash: passwordHash, full_name: fullName || '', role: newRole, email_verified: true, data: { company, assigned_event_ids, allowed_paths } } });
  if (company) await linkCompany(prisma, created.id, company);
  // Registrar asignación pendiente también (para trazabilidad)
  await prisma.pendingOperator.create({ data: { email, company, desired_role: newRole, assigned_event_ids, allowed_paths, status: 'processed' } }).catch(() => {});
  return { ok: true, pending: false, user: { id: created.id, email, role: newRole, company }, message: `Usuario creado con contraseña temporal "${setTempPassword ? tempPassword : 'cambiar123'}". Pedile que la cambie al primer ingreso.` };
}

async function linkCompany(prisma, userId, companyName) {
  const comps = await prisma.company.findMany({ where: { name: companyName } });
  if (comps.length) {
    const c = comps[0];
    if (!(c.assigned_user_ids || []).includes(userId)) await prisma.company.update({ where: { id: c.id }, data: { assigned_user_ids: [...(c.assigned_user_ids || []), userId] } });
  }
}