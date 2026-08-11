import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PAGE_SIZE = 500;
const UPPER = (v) => (typeof v === 'string' ? v.toUpperCase().trim() : v);

async function fetchAll(base44, entityName, filter = {}, sort = '-created_date') {
  let all = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities[entityName].filter(filter, sort, PAGE_SIZE, skip);
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (skip > 20000) break;
  }
  return all;
}

async function bulkUpdateChunked(base44, entityName, updates) {
  let applied = 0;
  for (let i = 0; i < updates.length; i += PAGE_SIZE) {
    const chunk = updates.slice(i, i + PAGE_SIZE);
    if (chunk.length === 0) continue;
    try {
      await base44.asServiceRole.entities[entityName].bulkUpdate(chunk);
      applied += chunk.length;
    } catch (e) {
      // fall back to per-record updates
      for (const u of chunk) {
        try { await base44.asServiceRole.entities[entityName].update(u.id, u); applied++; } catch {}
      }
    }
  }
  return applied;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user && ['superadmin', 'admin'].includes(user.role)) isAuthorized = true;
    } catch {
      // auth falló: NO otorgar acceso (mantener isAuthorized = false)
    }
    if (!isAuthorized) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const report = {
      companies_uppercased: 0,
      users_company_uppercased: 0,
      persons_productora_linked: 0,
      persons_event_names: 0,
      persons_tipo_vinculo: 0,
      accreditations_relinked: 0,
      vehicles_relinked: 0,
      documents_relinked: 0,
      biometrics_relinked: 0,
      approvals_relinked: 0,
      accesslogs_relinked: 0,
      errors: [],
    };

    // ── Load all entities in parallel ──
    const [events, persons, accreditations, vehicles, documents, biometrics, approvals, accesslogs, companies, users] =
      await Promise.all([
        fetchAll(base44, 'Event'),
        fetchAll(base44, 'Person'),
        fetchAll(base44, 'Accreditation'),
        fetchAll(base44, 'Vehicle'),
        fetchAll(base44, 'Document'),
        fetchAll(base44, 'Biometric'),
        fetchAll(base44, 'EventCompanyApproval'),
        fetchAll(base44, 'AccessLog'),
        fetchAll(base44, 'Company'),
        fetchAll(base44, 'User'),
      ]);

    const eventsById = new Map(events.map((e) => [e.id, e]));
    const personsById = new Map(persons.map((p) => [p.id, p]));

    // ── 1. Company.name → uppercase ──
    const companyUpdates = [];
    for (const c of companies) {
      const up = UPPER(c.name);
      if (up !== c.name) companyUpdates.push({ id: c.id, name: up });
    }
    report.companies_uppercased = await bulkUpdateChunked(base44, 'Company', companyUpdates);

    // ── 2. User.data.company → uppercase ──
    const userUpdates = [];
    for (const u of users) {
      const cur = u.data?.company || u.company || '';
      const up = UPPER(cur);
      if (up && up !== cur) {
        const newData = { ...(u.data || {}), company: up };
        userUpdates.push({ id: u.id, data: newData });
      }
    }
    try { report.users_company_uppercased = await bulkUpdateChunked(base44, 'User', userUpdates); }
    catch (e) { report.errors.push('users: ' + e.message); }

    // Helper: productora for a person = company of its primary event
    const productoraForPerson = (p) => {
      const ev = (p.event_id && eventsById.get(p.event_id)) || null;
      return ev?.company || p.productora || '';
    };

    // ── 3. Person: productora, event_names, tipo_vinculo ──
    const personUpdates = [];
    for (const p of persons) {
      const patch = {};
      const productora = productoraForPerson(p);
      if (productora && p.productora !== productora) patch.productora = productora;
      // event_names from event_id + event_ids
      const eids = new Set();
      if (p.event_id) eids.add(p.event_id);
      if (Array.isArray(p.event_ids)) p.event_ids.forEach((id) => id && eids.add(id));
      const names = [];
      eids.forEach((id) => { const ev = eventsById.get(id); if (ev?.name) names.push(ev.name); });
      const curNames = Array.isArray(p.event_names) ? p.event_names : [];
      if (names.length && JSON.stringify(names.sort()) !== JSON.stringify([...curNames].sort())) {
        patch.event_names = names;
      }
      // tipo_vinculo default
      if (!p.tipo_vinculo) {
        patch.tipo_vinculo = p.company ? 'empresa' : 'autonomo';
      }
      if (Object.keys(patch).length > 0) personUpdates.push({ id: p.id, ...patch });
    }
    if (personUpdates.length) {
      const applied = await bulkUpdateChunked(base44, 'Person', personUpdates);
      report.persons_productora_linked = personUpdates.filter((u) => u.productora).length;
      report.persons_event_names = personUpdates.filter((u) => u.event_names).length;
      report.persons_tipo_vinculo = personUpdates.filter((u) => u.tipo_vinculo).length;
      void applied;
    }

    // Refresh persons map after updates
    const refreshedPersons = persons.map((p) => {
      const u = personUpdates.find((x) => x.id === p.id);
      return u ? { ...p, ...u } : p;
    });
    refreshedPersons.forEach((p) => personsById.set(p.id, p));

    // ── 4. Accreditation: company, event_name, person_name, person_type, person_email ──
    const accUpdates = [];
    for (const a of accreditations) {
      const ev = eventsById.get(a.event_id);
      const p = personsById.get(a.person_id);
      const patch = {};
      const company = ev?.company || a.company || '';
      if (company && a.company !== company) patch.company = company;
      const eventName = ev?.name || a.event_name || '';
      if (eventName && a.event_name !== eventName) patch.event_name = eventName;
      const personName = p?.full_name || a.person_name || '';
      if (personName && a.person_name !== personName) patch.person_name = personName;
      const personType = p?.person_type || a.person_type || '';
      if (personType && a.person_type !== personType) patch.person_type = personType;
      const personEmail = p?.email || a.person_email || '';
      if (personEmail && a.person_email !== personEmail) patch.person_email = personEmail;
      if (Object.keys(patch).length > 0) accUpdates.push({ id: a.id, ...patch });
    }
    report.accreditations_relinked = await bulkUpdateChunked(base44, 'Accreditation', accUpdates);

    // ── 5. Vehicle: person_name, company, event_names ──
    const vehUpdates = [];
    for (const v of vehicles) {
      const p = personsById.get(v.person_id);
      const patch = {};
      const personName = p?.full_name || v.person_name || '';
      if (personName && v.person_name !== personName) patch.person_name = personName;
      // company from person's productora/event
      const ev = (p?.event_id && eventsById.get(p.event_id)) || null;
      const company = ev?.company || p?.productora || v.company || '';
      if (company && v.company !== company) patch.company = company;
      // event_names
      const eids = new Set();
      if (Array.isArray(v.event_ids)) v.event_ids.forEach((id) => id && eids.add(id));
      const names = [];
      eids.forEach((id) => { const e = eventsById.get(id); if (e?.name) names.push(e.name); });
      const curNames = Array.isArray(v.event_names) ? v.event_names : [];
      if (names.length && JSON.stringify(names.sort()) !== JSON.stringify([...curNames].sort())) {
        patch.event_names = names;
      }
      if (Object.keys(patch).length > 0) vehUpdates.push({ id: v.id, ...patch });
    }
    report.vehicles_relinked = await bulkUpdateChunked(base44, 'Vehicle', vehUpdates);

    // ── 6. Document: person_name, company ──
    const docUpdates = [];
    for (const d of documents) {
      const p = personsById.get(d.person_id);
      const ev = eventsById.get(d.event_id);
      const patch = {};
      const personName = p?.full_name || d.person_name || '';
      if (personName && d.person_name !== personName) patch.person_name = personName;
      const company = ev?.company || p?.productora || d.company || '';
      if (company && d.company !== company) patch.company = company;
      if (Object.keys(patch).length > 0) docUpdates.push({ id: d.id, ...patch });
    }
    report.documents_relinked = await bulkUpdateChunked(base44, 'Document', docUpdates);

    // ── 7. Biometric: person_name, company, event_id ──
    const bioUpdates = [];
    for (const b of biometrics) {
      const p = personsById.get(b.person_id);
      const patch = {};
      const personName = p?.full_name || b.person_name || '';
      if (personName && b.person_name !== personName) patch.person_name = personName;
      const ev = (b.event_id && eventsById.get(b.event_id)) || (p?.event_id && eventsById.get(p.event_id)) || null;
      const company = ev?.company || p?.productora || b.company || '';
      if (company && b.company !== company) patch.company = company;
      if (!b.event_id && p?.event_id) patch.event_id = p.event_id;
      if (Object.keys(patch).length > 0) bioUpdates.push({ id: b.id, ...patch });
    }
    report.biometrics_relinked = await bulkUpdateChunked(base44, 'Biometric', bioUpdates);

    // ── 8. EventCompanyApproval: event_name, company ──
    const apprUpdates = [];
    for (const a of approvals) {
      const ev = eventsById.get(a.event_id);
      const patch = {};
      const eventName = ev?.name || a.event_name || '';
      if (eventName && a.event_name !== eventName) patch.event_name = eventName;
      const company = ev?.company || a.company || '';
      if (company && a.company !== company) patch.company = company;
      if (Object.keys(patch).length > 0) apprUpdates.push({ id: a.id, ...patch });
    }
    report.approvals_relinked = await bulkUpdateChunked(base44, 'EventCompanyApproval', apprUpdates);

    // ── 9. AccessLog: event_name, company ──
    const logUpdates = [];
    for (const l of accesslogs) {
      const ev = eventsById.get(l.event_id);
      const patch = {};
      const eventName = ev?.name || l.event_name || '';
      if (eventName && l.event_name !== eventName) patch.event_name = eventName;
      const company = ev?.company || l.company || '';
      if (company && l.company !== company) patch.company = company;
      if (Object.keys(patch).length > 0) logUpdates.push({ id: l.id, ...patch });
    }
    report.accesslogs_relinked = await bulkUpdateChunked(base44, 'AccessLog', logUpdates);

    return Response.json({ success: true, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}