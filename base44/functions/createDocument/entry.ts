import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Crea un documento con autorización de productora vía service-role,
// ya que el RLS de Document exige data.company === user.data.company
// y las productoras suben documentos de empresas proveedoras (otro company).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      person_id, person_name, company, document_type, original_name,
      file_url, mime_type, size, status, expires_at, event_id, custom_fields,
    } = body;
    if (!document_type || !original_name || !file_url) {
      return Response.json({ error: 'Faltan datos del documento' }, { status: 400 });
    }

    const userCompany = user?.data?.company || user?.company || '';
    const assignedEventIds = user?.data?.assigned_event_ids || [];
    const role = user?.data?.role || user?.role || '';

    // Admins / coordinators can create any doc
    let authorized = ['superadmin', 'admin', 'coordinator'].includes(role);

    if (!authorized && role === 'productora') {
      // 1) Doc linked to one of the productora's assigned events
      if (event_id && assignedEventIds.includes(event_id)) {
        authorized = true;
      }
      // 2) Doc belongs to the productora's own company
      if (!authorized && company && company === userCompany) {
        authorized = true;
      }
      // 3) Doc belongs to a provider company approved for the productora's events
      if (!authorized && company) {
        try {
          const approvals = await base44.asServiceRole.entities.EventCompanyApproval.filter(
            { company: userCompany },
            '-created_date',
            500
          );
          const providerCompanies = new Set(approvals.map((a) => a.provider_company).filter(Boolean));
          authorized = providerCompanies.has(company);
        } catch {}
      }
      // 4) Doc belongs to a person under the productora's scope
      if (!authorized && person_id) {
        try {
          const person = await base44.asServiceRole.entities.Person.get(person_id);
          if (person) {
            if (person.productora && person.productora === userCompany) authorized = true;
            if (!authorized && person.event_id && assignedEventIds.includes(person.event_id)) authorized = true;
          }
        } catch {}
      }
    }

    // Empresa / provider can create docs for their own company
    if (!authorized && (role === 'empresa' || role === 'provider')) {
      if (company && company === userCompany) authorized = true;
    }

    if (!authorized) {
      return Response.json({ error: 'No tenés permiso para crear este documento' }, { status: 403 });
    }

    const payload = {
      person_id: person_id || '',
      person_name: person_name || '',
      company: company || '',
      document_type,
      original_name,
      file_url,
      mime_type: mime_type || '',
      size: size || 0,
      status: status || 'pending',
      expires_at: expires_at || null,
      event_id: event_id || '',
    };
    if (custom_fields !== undefined) payload.custom_fields = custom_fields;

    const created = await base44.asServiceRole.entities.Document.create(payload);
    return Response.json({ success: true, document: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}