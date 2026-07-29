import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userCompany = user?.data?.company || user?.company || '';
    const assignedEventIds = user?.data?.assigned_event_ids || [];

    // Service role queries bypass RLS so we can aggregate across provider companies
    // 1. Events owned by this productora
    const productoraEvents = await base44.asServiceRole.entities.Event.filter(
      { company: userCompany },
      '-start_at',
      200
    );
    const productoraEventIds = productoraEvents.map((e) => e.id);

    // 2. Provider companies approved (or pending) for the productora's events
    const approvals = await base44.asServiceRole.entities.EventCompanyApproval.filter(
      { company: userCompany },
      '-created_date',
      500
    );
    const providerCompanies = Array.from(new Set(approvals.map((a) => a.provider_company).filter(Boolean)));

    // 3. Documents: those linked to the productora's events OR uploaded by their provider companies
    let eventDocs = [];
    if (productoraEventIds.length > 0) {
      eventDocs = await base44.asServiceRole.entities.Document.filter(
        { event_id: { $in: productoraEventIds } },
        '-created_date',
        500
      );
    }

    let companyDocs = [];
    if (providerCompanies.length > 0) {
      companyDocs = await base44.asServiceRole.entities.Document.filter(
        { company: { $in: providerCompanies } },
        '-created_date',
        500
      );
    }

    // Merge and de-duplicate by id
    const seen = new Set();
    const docs = [];
    for (const d of [...eventDocs, ...companyDocs]) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        docs.push(d);
      }
    }

    // Also return provider company names so the client can build insurance coverage
    return Response.json({
      documents: docs,
      provider_companies: providerCompanies,
      event_ids: productoraEventIds,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}