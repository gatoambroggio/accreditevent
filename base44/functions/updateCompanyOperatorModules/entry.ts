import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    if (!['productora', 'admin', 'superadmin'].includes(role)) {
      return Response.json({ error: 'No tenés permisos para configurar módulos de operadores' }, { status: 403 });
    }
    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();
    if (!company) {
      return Response.json({ error: 'Tu usuario no tiene una empresa asignada' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const modules = Array.isArray(body.operator_allowed_paths) ? body.operator_allowed_paths : [];

    const companies = await base44.asServiceRole.entities.Company.filter({ name: company });
    if (!companies.length) return Response.json({ error: 'Empresa no encontrada' }, { status: 404 });

    await base44.asServiceRole.entities.Company.update(companies[0].id, { operator_allowed_paths: modules });

    return Response.json({ ok: true, operator_allowed_paths: modules });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al actualizar módulos' }, { status: 500 });
  }
}