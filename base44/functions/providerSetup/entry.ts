import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();

    // Check if person already exists for this email
    const existing = await base44.asServiceRole.entities.Person.filter({ email: body.email });
    let person;
    if (existing.length > 0) {
      person = existing[0];
      await base44.asServiceRole.entities.Person.update(person.id, {
        full_name: body.full_name,
        document: body.document,
        company: body.company,
        phone: body.phone,
        person_type: 'provider',
        status: 'active',
      });
    } else {
      person = await base44.asServiceRole.entities.Person.create({
        full_name: body.full_name,
        document: body.document,
        company: body.company,
        phone: body.phone,
        email: body.email,
        person_type: 'provider',
        status: 'active',
      });
    }

    // Update user role to provider
    await base44.asServiceRole.entities.User.update(user.id, {
      role: 'provider',
    });

    await base44.asServiceRole.entities.AuditLog.create({
      actor_name: body.full_name || user.email,
      actor_id: user.id,
      action: 'provider-self-register',
      entity: 'Person',
      entity_id: person.id,
      detail: body.company || '',
    });

    return Response.json({ person_id: person.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}