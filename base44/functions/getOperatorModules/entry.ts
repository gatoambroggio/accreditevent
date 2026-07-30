import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();

    if (!['operador', 'productora', 'admin', 'superadmin'].includes(role)) {
      return Response.json({ ok: true, modules: [] });
    }
    if (!company) return Response.json({ ok: true, modules: [] });

    const companies = await base44.asServiceRole.entities.Company.filter({ name: company });
    if (!companies.length) return Response.json({ ok: true, modules: [] });

    const modules = companies[0].operator_allowed_paths || [];
    return Response.json({ ok: true, modules });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al obtener módulos' }, { status: 500 });
  }
}