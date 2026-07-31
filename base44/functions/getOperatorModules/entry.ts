import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();
    const userId = user.id || (user.data && user.data.id) || '';

    // 1) Asignación individual (allowed_paths por usuario) tiene prioridad absoluta.
    //    Se lee del registro del usuario (fresh) para no depender de la sesión de auth.
    if (userId) {
      const recs = await base44.asServiceRole.entities.User.filter({ id: userId });
      const u = recs && recs[0];
      const perUser = (u && (u.allowed_paths || (u.data && u.data.allowed_paths))) || [];
      if (Array.isArray(perUser) && perUser.length > 0) {
        return Response.json({ ok: true, modules: perUser });
      }
    }

    // 2) Operadores sin asignación individual -> operator_allowed_paths de la empresa.
    if (role === 'operador') {
      if (!company) return Response.json({ ok: true, modules: [] });
      const companies = await base44.asServiceRole.entities.Company.filter({ name: company });
      if (!companies.length) return Response.json({ ok: true, modules: [] });
      const modules = companies[0].operator_allowed_paths || (companies[0].data && companies[0].data.operator_allowed_paths) || [];
      return Response.json({ ok: true, modules });
    }

    // 3) Resto de los roles sin asignación individual: sin restricción (menú completo por nivel).
    return Response.json({ ok: true, modules: [] });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al obtener módulos' }, { status: 500 });
  }
}