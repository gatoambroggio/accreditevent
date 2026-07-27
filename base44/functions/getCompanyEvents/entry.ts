import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Mode 1: fetch a single event by ID (for event-based registration links)
    if (body.event_id) {
      const event = await base44.asServiceRole.entities.Event.get(body.event_id);
      if (!event) return Response.json({ error: 'Evento no encontrado' }, { status: 404 });
      return Response.json({
        events: [event],
        event_name: event.name,
        company_name: event.company || '',
      });
    }

    // Mode 2: fetch all active events (no company filter)
    if (!body.company) {
      const allEvents = await base44.asServiceRole.entities.Event.list('-start_at', 100);
      const activeEvents = allEvents.filter((e) => e.status === 'active' || e.status === 'draft');
      return Response.json({ events: activeEvents, company_name: '' });
    }

    // Mode 3: fetch events by company slug/name (legacy)
    const slug = body.company;

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