export async function getCompanyOperators(_payload, { user, prisma }) {
  if (!['productora', 'admin', 'superadmin'].includes(user.role)) throw Object.assign(new Error('No tenés permisos'), { status: 403 });
  const company = (user?.data?.company || '').toUpperCase();
  if (user.role === 'productora' && !company) throw Object.assign(new Error('Tu usuario no tiene empresa asignada'), { status: 400 });
  const userFilter = user.role === 'productora' ? {} : {};
  const allUsers = await prisma.user.findMany({ orderBy: { created_at: 'desc' }, take: 500 });
  const operators = allUsers
    .filter((u) => user.role !== 'productora' || (u.data?.company || '').toUpperCase() === company)
    .filter((u) => user.role !== 'productora' || ASSIGNABLE.includes(u.role))
    .map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, company: u.data?.company || '', role: u.role, blocked: u.blocked, assigned_event_ids: u.data?.assigned_event_ids || [], allowed_paths: u.data?.allowed_paths || [] }));
  const pendingFilter = user.role === 'productora' ? { company, status: 'pending' } : { status: 'pending' };
  const pending = await prisma.pendingOperator.findMany({ where: pendingFilter, orderBy: { created_at: 'desc' }, take: 200 });
  let operator_allowed_paths = [];
  if (user.role === 'productora' && company) {
    const companies = await prisma.company.findMany({ where: { name: company } });
    if (companies.length) operator_allowed_paths = companies[0].operator_allowed_paths || [];
  }
  return { ok: true, operators, pending, operator_allowed_paths };
}
const ASSIGNABLE = ['operador', 'control', 'coordinator', 'provider', 'empresa'];