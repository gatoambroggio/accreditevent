import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();

    if (!body.full_name || !body.event_id) {
      return Response.json({ error: 'Faltan campos requeridos (full_name, event_id)' }, { status: 400 });
    }

    // Look up the event to get the productora company for RLS
    const event = await base44.asServiceRole.entities.Event.get(body.event_id);
    const productora = event?.company || '';

    // SECURITY: Check DNI duplicate BEFORE creating person
    if (body.document) {
      const normalizedDoc = String(body.document).replace(/\D/g, '');
      if (normalizedDoc) {
        const docMatches = await base44.asServiceRole.entities.Person.filter(
          { document: normalizedDoc },
          '-created_date',
          50
        );
        const docDup = docMatches.find((p) => p.email !== body.email);
        if (docDup) {
          return Response.json({
            error: `Ya existe una persona con ese DNI: ${docDup.full_name}. No pueden haber dos personas con el mismo documento.`,
          }, { status: 409 });
        }
      }
    }

    // Check if person already exists for this email
    const existing = await base44.asServiceRole.entities.Person.filter({ email: body.email });
    let person;
    if (existing.length > 0) {
      person = existing[0];
      await base44.asServiceRole.entities.Person.update(person.id, {
        full_name: body.full_name,
        document: body.document,
        company: body.company,
        productora,
        phone: body.phone,
        person_type: 'provider',
        tipo_vinculo: 'empresa',
        status: 'active',
        event_id: body.event_id,
      });
    } else {
      person = await base44.asServiceRole.entities.Person.create({
        full_name: body.full_name,
        document: body.document,
        company: body.company,
        productora,
        phone: body.phone,
        email: body.email,
        person_type: 'provider',
        tipo_vinculo: 'empresa',
        status: 'active',
        event_id: body.event_id,
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