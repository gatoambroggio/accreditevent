import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();

    if (!body.company_name) {
      return Response.json({ error: 'El nombre de la empresa es obligatorio' }, { status: 400 });
    }

    // Create or find ProviderCompany
    const existing = await base44.asServiceRole.entities.ProviderCompany.filter({ name: body.company_name });
    let company;
    if (existing.length > 0) {
      company = existing[0];
      await base44.asServiceRole.entities.ProviderCompany.update(company.id, {
        contact_phone: body.contact_phone || company.contact_phone,
        contact_email: body.contact_email || company.contact_email,
        description: body.description || company.description,
      });
    } else {
      company = await base44.asServiceRole.entities.ProviderCompany.create({
        name: body.company_name,
        description: body.description || '',
        contact_phone: body.contact_phone || '',
        contact_email: body.contact_email || '',
      });
    }

    // Update user role to empresa and link to company
    await base44.asServiceRole.entities.User.update(user.id, {
      role: 'empresa',
      company: company.name,
    });

    await base44.asServiceRole.entities.AuditLog.create({
      actor_name: company.name,
      actor_id: user.id,
      action: 'empresa-register',
      entity: 'ProviderCompany',
      entity_id: company.id,
      detail: company.name,
    });

    return Response.json({ company_id: company.id, company_name: company.name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}