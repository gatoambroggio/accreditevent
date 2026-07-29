import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { document_id, status, expires_at, review_note, custom_fields } = body;
    if (!document_id) return Response.json({ error: 'document_id es requerido' }, { status: 400 });

    const doc = await base44.asServiceRole.entities.Document.get(document_id);
    if (!doc) return Response.json({ error: 'Documento no encontrado' }, { status: 404 });

    // Authorization: the productora may only review docs linked to their events or their approved provider companies
    const userCompany = user?.data?.company || user?.company || '';
    const assignedEventIds = user?.data?.assigned_event_ids || [];
    const role = user?.data?.role || user?.role || '';

    // Admins / coordinators can review anything
    const canReviewAny = ['superadmin', 'admin', 'coordinator'].includes(role);
    let authorized = canReviewAny;

    if (!authorized && role === 'productora') {
      // Doc linked to one of the productora's assigned events
      if (doc.event_id && assignedEventIds.includes(doc.event_id)) {
        authorized = true;
      }
      // Doc belongs to a provider company approved for the productora's events
      if (!authorized && doc.company) {
        const approvals = await base44.asServiceRole.entities.EventCompanyApproval.filter(
          { company: userCompany },
          '-created_date',
          500
        );
        const providerCompanies = new Set(approvals.map((a) => a.provider_company).filter(Boolean));
        authorized = providerCompanies.has(doc.company);
      }
    }

    // Empresa users may review their own company's docs? No — only productora/admin here.
    if (!authorized) {
      return Response.json({ error: 'No tenés permiso para revisar este documento' }, { status: 403 });
    }

    const updatePayload = {
      status,
      expires_at: expires_at || '',
      review_note: review_note || '',
      reviewed_by: user?.full_name || user?.email || '',
      reviewed_at: new Date().toISOString(),
    };
    if (custom_fields !== undefined) updatePayload.custom_fields = custom_fields;
    const updated = await base44.asServiceRole.entities.Document.update(document_id, updatePayload);

    return Response.json({ success: true, document: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}