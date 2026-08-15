const ASSIGNABLE = ['operador', 'control', 'coordinator', 'provider', 'empresa'];
const ESSENTIAL_OPERATOR_MODULES = ['/personal-acreditado'];

export async function getOperatorModules(_payload, { user, prisma }) {
  const role = user.role;
  const company = (user?.data?.company || '').toUpperCase();
  const userId = user.id;
  let modules = [];
  // 1) Asignación individual del usuario
  const u = await prisma.user.findUnique({ where: { id: userId } });
  const perUser = u?.data?.allowed_paths || [];
  if (Array.isArray(perUser) && perUser.length > 0) modules = perUser;
  // 2) operator_allowed_paths de la empresa
  if (modules.length === 0 && role === 'operador' && company) {
    const companies = await prisma.company.findMany({ where: { name: company } });
    if (companies.length) modules = companies[0].operator_allowed_paths || [];
  }
  // 3) Garantizar esenciales para operadores
  if (role === 'operador') {
    const set = new Set(modules);
    ESSENTIAL_OPERATOR_MODULES.forEach((m) => set.add(m));
    modules = Array.from(set);
  }
  return { ok: true, modules };
}