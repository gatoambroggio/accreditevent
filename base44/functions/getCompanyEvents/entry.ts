import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const slug = body.company;
    if (!slug) return Response.json({ error: 'Empresa requerida' }, { status: 400 });

    let companyName = slug;
    try {
      const companies = await base44.asServiceRole.entities.Company.filter({ slug: slug });
      if (companies.length > 0) {
        companyName = companies[0].name;
      } else {
        const byName = await base44.asServiceRole.entities.Company.filter({ name: slug });
        if (byName.length > 0) {
          companyName = byName[0].name;
        }
      }
    } catch {}

    const events = await base44.asServiceRole.entities.Event.filter(
      { company: companyName },
      '-start_at',
      100
    );
    const activeEvents = events.filter((e) => e.status === 'active' || e.status === 'draft');
    return Response.json({ events: activeEvents, company_name: companyName });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}