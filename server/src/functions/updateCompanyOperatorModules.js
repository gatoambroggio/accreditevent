export async function updateCompanyOperatorModules({ operator_allowed_paths }, { user, prisma }) {
  if (!['productora', 'admin', 'superadmin'].includes(user.role)) throw Object.assign(new Error('No tenés permisos'), { status: 403 });
  const company = (user?.data?.company || '').toUpperCase();
  if (!company) throw Object.assign(new Error('Tu usuario no tiene empresa asignada'), { status: 400 });
  const modules = Array.isArray(operator_allowed_paths) ? operator_allowed_paths : [];
  const companies = await prisma.company.findMany({ where: { name: company } });
  if (!companies.length) throw Object.assign(new Error('Empresa no encontrada'), { status: 404 });
  await prisma.company.update({ where: { id: companies[0].id }, data: { operator_allowed_paths: modules } });
  return { ok: true, operator_allowed_paths: modules };
}