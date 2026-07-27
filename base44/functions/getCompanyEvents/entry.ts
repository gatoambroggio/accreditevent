import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const company = body.company;
    if (!company) return Response.json({ error: 'Empresa requerida' }, { status: 400 });

    const events = await base44.asServiceRole.entities.Event.filter(
      { company: company },
      '-start_at',
      100
    );
    const activeEvents = events.filter((e) => e.status === 'active' || e.status === 'draft');
    return Response.json({ events: activeEvents });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}