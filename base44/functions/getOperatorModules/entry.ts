import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Módulos operativos esenciales que todo operador debe poder ver, independientemente
// de la asignación de la productora. "Personal acreditado" es donde se editan/eliminan
// acreditaciones; sin él un operador solo puede acreditar pero no gestionar.
const ESSENTIAL_OPERATOR_MODULES = ['/personal-acreditado'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const role = user.role || (user.data && user.data.role);
    const company = (user.company || (user.data && user.data.company) || '').toUpperCase();
    const userId = user.id || (user.data && user.data.id) || '';

    let modules = [];

    // 1) Asignación individual (allowed_paths por usuario) tiene prioridad.
    //    Se lee del registro del usuario (fresh) para no depender de la sesión de auth.
    if (userId) {
      const recs = await base44.asServiceRole.entities.User.filter({ id: userId });
      const u = recs && recs[0];
      const perUser = (u && (u.allowed_paths || (u.data && u.data.allowed_paths))) || [];
      if (Array.isArray(perUser) && perUser.length > 0) {
        modules = perUser;
      }
    }

    // 2) Operadores sin asignación individual -> operator_allowed_paths de la empresa.
    if (modules.length === 0 && role === 'operador') {
      if (company) {
        const companies = await base44.asServiceRole.entities.Company.filter({ name: company });
        if (companies.length) {
          modules = companies[0].operator_allowed_paths || (companies[0].data && companies[0].data.operator_allowed_paths) || [];
        }
      }
    }

    // 3) Operadores: garantizar siempre los módulos operativos esenciales
    //    (Personal acreditado = gestión de acreditaciones: editar/eliminar).
    if (role === 'operador') {
      const set = new Set(modules);
      ESSENTIAL_OPERATOR_MODULES.forEach((m) => set.add(m));
      modules = Array.from(set);
    }

    return Response.json({ ok: true, modules });
  } catch (error) {
    return Response.json({ error: error.message || 'Error al obtener módulos' }, { status: 500 });
  }
}