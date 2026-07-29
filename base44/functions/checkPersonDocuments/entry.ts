import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const personId = body?.person_id;
    if (!personId) return Response.json({ error: 'person_id is required' }, { status: 400 });

    // Fetch the person to determine documentation requirements
    const person = await base44.asServiceRole.entities.Person.get(personId);
    const hasCompany = !!person?.company;

    // Use service role to bypass RLS and reliably fetch all documents for the person
    const docs = await base44.asServiceRole.entities.Document.filter(
      { person_id: personId },
      '-created_date',
      100
    );

    const now = new Date();

    // If the person belongs to a company (empleado/empresa person):
    // Only check work_insurance (seguro). Pending or missing insurance doesn't block.
    // Only block if insurance is explicitly rejected.
    if (hasCompany) {
      const insuranceDocs = docs.filter((d) => d.document_type === 'work_insurance');
      const hasRejectedInsurance = insuranceDocs.some((d) => d.status === 'rejected');
      if (hasRejectedInsurance) {
        return Response.json({
          has_pending: true,
          pending_count: 1,
          pending_statuses: ['rejected'],
        });
      }
      return Response.json({
        has_pending: false,
        pending_count: 0,
        pending_statuses: [],
      });
    }

    // For unique persons (no company): all document types must be approved and not expired
    // No documents at all = blocked
    if (docs.length === 0) {
      return Response.json({
        has_pending: true,
        pending_count: 0,
        pending_statuses: ['no_documents'],
      });
    }

    // A document is valid only if approved and not expired
    const isValid = (d) => {
      if (d.status !== 'approved') return false;
      if (d.expires_at && new Date(d.expires_at + 'T23:59:59') < now) return false;
      return true;
    };

    // Group by document_type: each type needs at least one valid document.
    // An expired/pending old doc of the same type doesn't block if a newer valid one exists.
    const docsByType = {};
    docs.forEach((d) => {
      const key = d.document_type || 'other';
      if (!docsByType[key]) docsByType[key] = [];
      docsByType[key].push(d);
    });

    const pendingTypes = Object.entries(docsByType)
      .filter(([, typeDocs]) => !typeDocs.some(isValid))
      .map(([type, typeDocs]) => ({
        type,
        statuses: [...new Set(typeDocs.map((d) => d.status === 'approved' ? 'expired' : d.status))],
      }));

    return Response.json({
      has_pending: pendingTypes.length > 0,
      pending_count: pendingTypes.length,
      pending_statuses: pendingTypes.flatMap((t) => t.statuses),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}