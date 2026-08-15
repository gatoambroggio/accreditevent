const ASSIGNABLE = ['operador', 'control', 'coordinator', 'provider', 'empresa'];

export async function updateOperator(body, { user, prisma }) {
  if (!['productora', 'admin', 'superadmin'].includes(user.role)) throw Object.assign(new Error('No tenés permisos para editar operadores'), { status: 403 });
  const targetId = (body.user_id || '').toString().trim();
  if (!targetId) throw Object.assign(new Error('user_id requerido'), { status: 400 });
  const myCompany = (user?.data?.company || '').toUpperCase();
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  const targetRole = target.role;
  const targetCompany = (target.data?.company || '').toUpperCase();
  if (user.role === 'productora') {
    if (!ASSIGNABLE.includes(targetRole)) throw Object.assign(new Error('Solo podés editar usuarios con roles operacionales'), { status: 403 });
    if (targetCompany !== myCompany) throw Object.assign(new Error('El usuario no pertenece a tu empresa'), { status: 403 });
  }
  const update = {};
  const newData = { ...(target.data || {}) };
  if (body.role !== undefined) {
    const newRole = String(body.role);
    if (user.role === 'productora' && !ASSIGNABLE.includes(newRole)) throw Object.assign(new Error('No podés asignar ese rol'), { status: 403 });
    update.role = newRole;
  }
  if (body.assigned_event_ids !== undefined) newData.assigned_event_ids = Array.isArray(body.assigned_event_ids) ? body.assigned_event_ids : [];
  if (body.allowed_paths !== undefined) newData.allowed_paths = Array.isArray(body.allowed_paths) ? body.allowed_paths : [];
  if (body.blocked !== undefined) update.blocked = !!body.blocked;
  update.data = newData;
  await prisma.user.update({ where: { id: targetId }, data: update });
  return { ok: true, user: { id: targetId, ...update } };
}