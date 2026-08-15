const UPPER = (v) => (typeof v === 'string' ? v.toUpperCase().trim() : v);

// Reconciliación de datos denormalizados (company, event_name, person_name,
// productora, event_names, tipo_vinculo) a partir de los registros padre.
export async function cleanupDatabase(_payload, { user, prisma }) {
  if (!['superadmin', 'admin'].includes(user.role)) throw Object.assign(new Error('No autorizado'), { status: 401 });
  const report = { companies_uppercased: 0, users_company_uppercased: 0, persons_productora_linked: 0, persons_event_names: 0, persons_tipo_vinculo: 0, accreditations_relinked: 0, vehicles_relinked: 0, documents_relinked: 0, biometrics_relinked: 0, approvals_relinked: 0, accesslogs_relinked: 0, errors: [] };

  const [events, persons, accreditations, vehicles, documents, biometrics, approvals, accesslogs, companies, users] = await Promise.all([
    prisma.event.findMany(), prisma.person.findMany(), prisma.accreditation.findMany(), prisma.vehicle.findMany(),
    prisma.document.findMany(), prisma.biometric.findMany(), prisma.eventCompanyApproval.findMany(),
    prisma.accessLog.findMany(), prisma.company.findMany(), prisma.user.findMany(),
  ]);
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const personsById = new Map(persons.map((p) => [p.id, p]));

  // 1. Company.name uppercase
  for (const c of companies) { const up = UPPER(c.name); if (up !== c.name) { await prisma.company.update({ where: { id: c.id }, data: { name: up } }).catch(() => {}); report.companies_uppercased++; } }
  // 2. User.data.company uppercase
  for (const u of users) {
    const cur = u.data?.company || ''; const up = UPPER(cur);
    if (up && up !== cur) { await prisma.user.update({ where: { id: u.id }, data: { data: { ...(u.data || {}), company: up } } }).catch(() => {}); report.users_company_uppercased++; }
  }
  // 3. Person: productora, event_names, tipo_vinculo
  for (const p of persons) {
    const patch = {};
    const ev = p.event_id && eventsById.get(p.event_id);
    const productora = ev?.company || p.productora || '';
    if (productora && p.productora !== productora) patch.productora = productora;
    const eids = new Set(); if (p.event_id) eids.add(p.event_id); (p.event_ids || []).forEach((id) => id && eids.add(id));
    const names = []; eids.forEach((id) => { const e = eventsById.get(id); if (e?.name) names.push(e.name); });
    if (names.length && JSON.stringify(names.sort()) !== JSON.stringify([...(p.event_names || [])].sort())) patch.event_names = names;
    if (!p.tipo_vinculo) patch.tipo_vinculo = p.company ? 'empresa' : 'autonomo';
    if (Object.keys(patch).length) { await prisma.person.update({ where: { id: p.id }, data: patch }).catch(() => {}); report.persons_productora_linked += patch.productora ? 1 : 0; report.persons_event_names += patch.event_names ? 1 : 0; report.persons_tipo_vinculo += patch.tipo_vinculo ? 1 : 0; }
  }
  // 4. Accreditation
  for (const a of accreditations) {
    const ev = eventsById.get(a.event_id), p = personsById.get(a.person_id), patch = {};
    const company = ev?.company || a.company || ''; if (company && a.company !== company) patch.company = company;
    const eventName = ev?.name || a.event_name || ''; if (eventName && a.event_name !== eventName) patch.event_name = eventName;
    const personName = p?.full_name || a.person_name || ''; if (personName && a.person_name !== personName) patch.person_name = personName;
    const personType = p?.person_type || a.person_type || ''; if (personType && a.person_type !== personType) patch.person_type = personType;
    const personEmail = p?.email || a.person_email || ''; if (personEmail && a.person_email !== personEmail) patch.person_email = personEmail;
    if (Object.keys(patch).length) { await prisma.accreditation.update({ where: { id: a.id }, data: patch }).catch(() => {}); report.accreditations_relinked++; }
  }
  // 5. Vehicle
  for (const v of vehicles) {
    const p = personsById.get(v.person_id), patch = {};
    const personName = p?.full_name || v.person_name || ''; if (personName && v.person_name !== personName) patch.person_name = personName;
    const ev = p?.event_id && eventsById.get(p.event_id); const company = ev?.company || p?.productora || v.company || ''; if (company && v.company !== company) patch.company = company;
    if (Object.keys(patch).length) { await prisma.vehicle.update({ where: { id: v.id }, data: patch }).catch(() => {}); report.vehicles_relinked++; }
  }
  // 6. Document
  for (const d of documents) {
    const p = personsById.get(d.person_id), ev = eventsById.get(d.event_id), patch = {};
    const personName = p?.full_name || d.person_name || ''; if (personName && d.person_name !== personName) patch.person_name = personName;
    const company = ev?.company || p?.productora || d.company || ''; if (company && d.company !== company) patch.company = company;
    if (Object.keys(patch).length) { await prisma.document.update({ where: { id: d.id }, data: patch }).catch(() => {}); report.documents_relinked++; }
  }
  // 7. Biometric
  for (const b of biometrics) {
    const p = personsById.get(b.person_id), patch = {};
    const personName = p?.full_name || b.person_name || ''; if (personName && b.person_name !== personName) patch.person_name = personName;
    const ev = (b.event_id && eventsById.get(b.event_id)) || (p?.event_id && eventsById.get(p.event_id));
    const company = ev?.company || p?.productora || b.company || ''; if (company && b.company !== company) patch.company = company;
    if (!b.event_id && p?.event_id) patch.event_id = p.event_id;
    if (Object.keys(patch).length) { await prisma.biometric.update({ where: { id: b.id }, data: patch }).catch(() => {}); report.biometrics_relinked++; }
  }
  // 8. EventCompanyApproval
  for (const a of approvals) {
    const ev = eventsById.get(a.event_id), patch = {};
    const eventName = ev?.name || a.event_name || ''; if (eventName && a.event_name !== eventName) patch.event_name = eventName;
    const company = ev?.company || a.company || ''; if (company && a.company !== company) patch.company = company;
    if (Object.keys(patch).length) { await prisma.eventCompanyApproval.update({ where: { id: a.id }, data: patch }).catch(() => {}); report.approvals_relinked++; }
  }
  // 9. AccessLog
  for (const l of accesslogs) {
    const ev = eventsById.get(l.event_id), patch = {};
    const eventName = ev?.name || l.event_name || ''; if (eventName && l.event_name !== eventName) patch.event_name = eventName;
    const company = ev?.company || l.company || ''; if (company && l.company !== company) patch.company = company;
    if (Object.keys(patch).length) { await prisma.accessLog.update({ where: { id: l.id }, data: patch }).catch(() => {}); report.accesslogs_relinked++; }
  }
  return { success: true, report };
}