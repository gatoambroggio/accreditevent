export async function getCompanyEvents(body, { prisma }) {
  if (body.event_id) {
    const event = await prisma.event.findUnique({ where: { id: body.event_id } });
    if (!event) throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
    return { events: [event], event_name: event.name, company_name: event.company || '' };
  }
  if (!body.company) {
    const allEvents = await prisma.event.findMany({ orderBy: { start_at: 'desc' }, take: 100 });
    return { events: allEvents.filter((e) => e.status === 'active' || e.status === 'draft'), company_name: '' };
  }
  let companyName = body.company;
  const companies = await prisma.company.findMany({ where: { slug: body.company } });
  if (companies.length) companyName = companies[0].name;
  else { const byName = await prisma.company.findMany({ where: { name: body.company } }); if (byName.length) companyName = byName[0].name; }
  const events = await prisma.event.findMany({ where: { company: companyName }, orderBy: { start_at: 'desc' }, take: 100 });
  return { events: events.filter((e) => e.status === 'active' || e.status === 'draft'), company_name: companyName };
}