export async function assignOperator({ email }, { user, prisma }) {
  if (!['productora', 'admin', 'superadmin'].includes(user.role)) throw Object.assign(new Error('No tenés permisos para asignar operadores'), { status: 403 });
  email = (email || '').toString().trim().toLowerCase();
  if (!email) throw Object.assign(new Error('Email requerido'), { status: 400 });
  const company = (user?.data?.company || '').toUpperCase();
  if (user.role === 'productora' && !company) throw Object.assign(new Error('Tu usuario no tiene empresa asignada'), { status: 400 });

  const found = await prisma.user.findMany({ where: { email } });
  if (!found.length) {
    // air-gap: registrar como pendiente (el admin lo crea después con createUser)
    const existingPending = await prisma.pendingOperator.findMany({ where: { email, company, status: 'pending' } });
    if (existingPending.length) await prisma.pendingOperator.update({ where: { id: existingPending[0].id }, data: { company } });
    else await prisma.pendingOperator.create({ data: { email, company, status: 'pending' } });
    return { ok: true, pending: true, message: `Quedó registrada como operador pendiente de ${company}. Creá el usuario desde el panel cuando tenga contraseña.` };
  }
  const target = found[0];
  if (['productora', 'admin', 'superadmin'].includes(target.role)) throw Object.assign(new Error('No se puede asignar como operador a un usuario con rol superior'), { status: 400 });
  await prisma.user.update({ where: { id: target.id }, data: { role: 'operador', data: { ...((target.data || {})), company } } });
  await linkCompany(prisma, target.id, company);
  return { ok: true, pending: false, user: { id: target.id, email: target.email, role: 'operador', company } };
}

async function linkCompany(prisma, userId, companyName) {
  const comps = await prisma.company.findMany({ where: { name: companyName } });
  if (comps.length) {
    const c = comps[0];
    if (!(c.assigned_user_ids || []).includes(userId)) await prisma.company.update({ where: { id: c.id }, data: { assigned_user_ids: [...(c.assigned_user_ids || []), userId] } });
  }
}