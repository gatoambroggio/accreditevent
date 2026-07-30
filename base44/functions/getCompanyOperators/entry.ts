import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    if (!['productora', 'admin', 'superadmin'].includes(role)) {
      return Response.json({ error: 'No tenés permisos para ver operadores' }, { status: 403 });
    }
    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();
    if (role === 'productora' && !company) {
      return Response.json({ error: 'Tu usuario no tiene una empresa asignada' }, { status: 400 });
    }

    // Operadores ya registrados
    const userFilter = role === 'productora' ? { company } : {};
    const allUsers = await base44.asServiceRole.entities.User.filter(userFilter, '-created_date', 500);
    const operators = (allUsers || [])
      .filter((u) => (u.role || (u.data && u.data.role)) === 'operador')
      .map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        company: u.company,
        role: u.role || (u.data && u.data.role),
        blocked: u.blocked,
        assigned_event_ids: u.assigned_event_ids || (u.data && u.data.assigned_event_ids) || [],
        allowed_paths: u.allowed_paths || (u.data && u.data.allowed_paths) || [],
      }));

    // Invitaciones pendientes (no registradas todavía)
    const pendingFilter = role === 'productora' ? { company, status: 'pending' } : { status: 'pending' };
    const pending = await base44.asServiceRole.entities.PendingOperator.filter(pendingFilter, '-created_date', 200);

    // Módulos configurados para operadores a nivel de empresa
    let operator_allowed_paths = [];
    if (role === 'productora' && company) {
      const companies = await base44.asServiceRole.entities.Company.filter({ name: company });
      if (companies.length) operator_allowed_paths = companies[0].operator_allowed_paths || [];
    }

    return Response.json({ ok: true, operators, pending: pending || [], operator_allowed_paths });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al obtener operadores' }, { status: 500 });
  }
}