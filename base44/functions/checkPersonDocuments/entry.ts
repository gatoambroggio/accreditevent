import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const personId = body?.person_id;
    const eventId = body?.event_id;
    if (!personId) return Response.json({ error: 'person_id is required' }, { status: 400 });

    const person = await base44.asServiceRole.entities.Person.get(personId);
    const hasCompany = !!person?.company;
    // Use explicit tipo_vinculo if set; fall back to company presence for backward compatibility
    const tipoVinculo = person?.tipo_vinculo || (hasCompany ? 'empresa' : 'autonomo');

    // Biometric check via service role (bypasses RLS so productoras can see empresa-created biometrics)
    let hasBiometric = false;
    try {
      const bios = await base44.asServiceRole.entities.Biometric.filter(
        { person_id: personId, status: 'active' },
        '-created_date',
        1
      );
      hasBiometric = bios.length > 0;
    } catch {}

    // ════════════════════════════════════════════════════════════
    // EMPRESA: company-level approval covers all employees
    // ════════════════════════════════════════════════════════════
    if (tipoVinculo === 'empresa') {
      const eventIdsToCheck = [];
      if (eventId) {
        eventIdsToCheck.push(eventId);
      } else {
        if (person.event_id) eventIdsToCheck.push(person.event_id);
        if (Array.isArray(person.event_ids)) eventIdsToCheck.push(...person.event_ids);
      }

      if (eventIdsToCheck.length > 0) {
        const approvals = await base44.asServiceRole.entities.EventCompanyApproval.filter(
          { provider_company: person.company, status: 'approved' },
          '-created_date',
          50
        );
        const approvedEventIds = new Set(approvals.map((a) => a.event_id));
        const hasApproved = eventIdsToCheck.some((eid) => approvedEventIds.has(eid));

        if (hasApproved) {
          return Response.json({
            has_pending: false,
            pending_count: 0,
            pending_statuses: [],
            has_biometric: hasBiometric,
          });
        }

        return Response.json({
          has_pending: true,
          pending_count: 1,
          pending_statuses: ['company_not_approved'],
          has_biometric: hasBiometric,
        });
      }

      // No events to check — fall back to work_insurance at individual level
      const docs = await base44.asServiceRole.entities.Document.filter(
        { person_id: personId },
        '-created_date',
        100
      );
      const insuranceDocs = docs.filter((d) => d.document_type === 'work_insurance');
      const hasRejectedInsurance = insuranceDocs.some((d) => d.status === 'rejected');
      if (hasRejectedInsurance) {
        return Response.json({
          has_pending: true,
          pending_count: 1,
          pending_statuses: ['rejected'],
          has_biometric: hasBiometric,
        });
      }
      return Response.json({
        has_pending: false,
        pending_count: 0,
        pending_statuses: [],
        has_biometric: hasBiometric,
      });
    }

    // ════════════════════════════════════════════════════════════
    // AUTÓNOMO: individual documents must be approved (insurance key)
    // ════════════════════════════════════════════════════════════
    const docs = await base44.asServiceRole.entities.Document.filter(
      { person_id: personId },
      '-created_date',
      100
    );

    const now = new Date();

    if (docs.length === 0) {
      return Response.json({
        has_pending: true,
        pending_count: 0,
        pending_statuses: ['no_documents'],
        has_biometric: hasBiometric,
      });
    }

    const isValid = (d) => {
      if (d.status !== 'approved') return false;
      if (d.expires_at && new Date(d.expires_at + 'T23:59:59') < now) return false;
      return true;
    };

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
      has_biometric: hasBiometric,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}