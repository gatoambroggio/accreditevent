import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    if (!['productora', 'admin', 'superadmin'].includes(role)) {
      return Response.json({ error: 'No tenés permisos para editar operadores' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetId = (body && body.user_id ? body.user_id : '').toString().trim();
    if (!targetId) return Response.json({ error: 'user_id requerido' }, { status: 400 });

    const myCompany = (user.company || (user.data && user.data.company) || '').toUpperCase();

    // Buscar el usuario objetivo con service role
    const found = await base44.asServiceRole.entities.User.filter({ id: targetId });
    if (!found.length) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    const target = found[0];
    const targetRole = target.role || (target.data && target.data.role);
    const targetCompany = (target.company || (target.data && target.data.company) || '').toUpperCase();

    // La productora solo puede editar usuarios con roles operacionales de su propia empresa
    const ASSIGNABLE = ['operador', 'control', 'coordinator', 'provider', 'empresa'];
    if (role === 'productora') {
      if (!ASSIGNABLE.includes(targetRole)) {
        return Response.json({ error: 'Solo podés editar usuarios con roles operacionales' }, { status: 403 });
      }
      if (targetCompany !== myCompany) {
        return Response.json({ error: 'El usuario no pertenece a tu empresa' }, { status: 403 });
      }
    }

    // Construir payload solo con campos permitidos
    const update = {};
    if (body.role !== undefined) {
      const newRole = String(body.role);
      if (role === 'productora' && !ASSIGNABLE.includes(newRole)) {
        return Response.json({ error: 'No podés asignar ese rol' }, { status: 403 });
      }
      update.role = newRole;
    }
    if (body.assigned_event_ids !== undefined) {
      update.assigned_event_ids = Array.isArray(body.assigned_event_ids) ? body.assigned_event_ids : [];
    }
    if (body.allowed_paths !== undefined) {
      update.allowed_paths = Array.isArray(body.allowed_paths) ? body.allowed_paths : [];
    }
    if (body.blocked !== undefined) {
      update.blocked = !!body.blocked;
    }

    await base44.asServiceRole.entities.User.update(targetId, update);

    return Response.json({ ok: true, user: { id: targetId, ...update } });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al actualizar operador' }, { status: 500 });
  }
}