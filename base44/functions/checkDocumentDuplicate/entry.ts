import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { document, email, person_id } = body;

    if (!document && !email) {
      return Response.json({ error: 'document o email es obligatorio' }, { status: 400 });
    }

    let docDup = null;
    let emailDup = null;

    // Check document duplicate (global, service role)
    if (document) {
      const normalized = String(document).replace(/\D/g, '');
      if (normalized) {
        const docPersons = await base44.asServiceRole.entities.Person.filter(
          { document: normalized },
          '-created_date',
          50
        );
        const docMatch = docPersons.find((p) => p.id !== person_id);
        if (docMatch) {
          docDup = {
            id: docMatch.id,
            full_name: docMatch.full_name,
            document: docMatch.document,
            company: docMatch.company || '',
            tipo_vinculo: docMatch.tipo_vinculo || 'empresa',
          };
        }
      }
    }

    // Check email duplicate (global, service role)
    if (email) {
      const emailPersons = await base44.asServiceRole.entities.Person.filter(
        { email: email },
        '-created_date',
        50
      );
      const emailMatch = emailPersons.find((p) => p.id !== person_id);
      if (emailMatch) {
        emailDup = {
          id: emailMatch.id,
          full_name: emailMatch.full_name,
          document: emailMatch.document,
          company: emailMatch.company || '',
          tipo_vinculo: emailMatch.tipo_vinculo || 'empresa',
        };
      }
    }

    const isDuplicate = !!(docDup || emailDup);
    const existing = docDup || emailDup;
    const duplicateType = docDup ? 'document' : (emailDup ? 'email' : null);

    return Response.json({
      is_duplicate: isDuplicate,
      duplicate_type: duplicateType,
      existing_person: existing,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}