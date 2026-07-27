import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const now = Date.now();
    const events = await base44.asServiceRole.entities.Event.filter(
      { status: 'active' },
      '-created_date',
      500
    );

    const expired = events.filter((evt) => {
      if (!evt.end_at) return false;
      const endMs = new Date(evt.end_at).getTime();
      if (isNaN(endMs)) return false;
      const graceHours = evt.grace_hours ?? 4;
      const graceEnd = endMs + graceHours * 3600000;
      return now > graceEnd;
    });

    let closed = 0;
    for (const evt of expired) {
      try {
        await base44.asServiceRole.entities.Event.update(evt.id, { status: 'closed' });
        closed++;
      } catch {}
    }

    return Response.json({
      closed,
      total_checked: events.length,
      expired_found: expired.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}