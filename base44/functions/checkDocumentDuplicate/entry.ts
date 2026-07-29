import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { document, person_id } = body;

    if (!document || typeof document !== 'string') {
      return Response.json({ error: 'document es obligatorio' }, { status: 400 });
    }

    // Normalize: digits only
    const normalized = document.replace(/\D/g, '');
    if (!normalized) {
      return Response.json({ error: 'document no puede estar vacío' }, { status: 400 });
    }

    // Search globally across ALL persons (service role bypasses RLS)
    const persons = await base44.asServiceRole.entities.Person.filter(
      { document: normalized },
      '-created_date',
      50
    );

    // Exclude the current person (when editing)
    const duplicates = persons.filter((p) => p.id !== person_id);

    return Response.json({
      is_duplicate: duplicates.length > 0,
      existing_person: duplicates[0]
        ? {
            id: duplicates[0].id,
            full_name: duplicates[0].full_name,
            document: duplicates[0].document,
            company: duplicates[0].company || '',
            tipo_vinculo: duplicates[0].tipo_vinculo || 'empresa',
          }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}