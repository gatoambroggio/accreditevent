import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Tenant-isolated bulk document delete.
// Uses the service role (bypasses RLS) and only deletes documents that belong
// to the caller's productora tenant, so each productora only touches its own data.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = user?.data?.company || user?.company || '';
    const role = user?.data?.role || user?.role || '';

    const body = await req.json();
    const { document_ids } = body;
    if (!Array.isArray(document_ids) || document_ids.length === 0) {
      return Response.json({ error: 'No se enviaron documentos.' }, { status: 400 });
    }

    // Build the set of resources the caller is allowed to touch.
    let allowedEventIds = [];
    let allowedCompanyNames = [];
    if (role === 'productora') {
      if (!tenant) return Response.json({ error: 'Sin productora asignada.' }, { status: 403 });
      const [events, approvals] = await Promise.all([
        base44.asServiceRole.entities.Event.filter({ company: tenant }, '-created_date', 200),
        base44.asServiceRole.entities.EventCompanyApproval.filter({ company: tenant }, '-created_date', 500),
      ]);
      allowedEventIds = new Set(events.map((e) => e.id));
      allowedCompanyNames = new Set([tenant, ...approvals.map((a) => a.provider_company).filter(Boolean)]);
    }

    const deleted = [];
    const denied = [];
    for (const id of document_ids) {
      try {
        const doc = await base44.asServiceRole.entities.Document.get(id);
        if (!doc) { denied.push({ id, reason: 'No encontrado' }); continue; }

        if (role === 'productora') {
          const ok =
            allowedCompanyNames.has(doc.company) ||
            (doc.event_id && allowedEventIds.has(doc.event_id)) ||
            doc.created_by_id === user.id;
          if (!ok) { denied.push({ id, reason: 'Fuera de tu productora' }); continue; }
        }
        // Admins/superadmins/coordinators fall through and can delete anything.
        await base44.asServiceRole.entities.Document.delete(id);
        deleted.push(id);
      } catch (e) {
        denied.push({ id, reason: e.message });
      }
    }

    return Response.json({ deleted, denied, deleted_count: deleted.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}