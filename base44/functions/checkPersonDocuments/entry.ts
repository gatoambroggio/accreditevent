import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const personId = body?.person_id;
    if (!personId) return Response.json({ error: 'person_id is required' }, { status: 400 });

    // Use service role to bypass RLS and reliably fetch all documents for the person
    const docs = await base44.asServiceRole.entities.Document.filter(
      { person_id: personId },
      '-created_date',
      100
    );

    const pending = docs.filter((d) => d.status !== 'approved');
    return Response.json({
      has_pending: pending.length > 0,
      pending_count: pending.length,
      pending_statuses: [...new Set(pending.map((d) => d.status))],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}