import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

// Crea un documento con autorización de productora (la lógica de createDocument
// de Base44, que valida scope del productora antes de insertar).
export async function createDocument(body, { user, prisma }) {
  const { person_id, person_name, company, document_type, original_name, file_url, mime_type, size, status, expires_at, event_id, custom_fields } = body;
  if (!document_type || !original_name || !file_url) throw Object.assign(new Error('Faltan datos del documento'), { status: 400 });

  const userCompany = user?.data?.company || '';
  const assignedEventIds = user?.data?.assigned_event_ids || [];
  const role = user.role;
  let authorized = ['superadmin', 'admin', 'coordinator'].includes(role);
  if (!authorized && role === 'productora') {
    if (event_id && assignedEventIds.includes(event_id)) authorized = true;
    if (!authorized && company && company === userCompany) authorized = true;
    if (!authorized && company) {
      const approvals = await prisma.eventCompanyApproval.findMany({ where: { company: userCompany } });
      if (new Set(approvals.map((a) => a.provider_company).filter(Boolean)).has(company)) authorized = true;
    }
    if (!authorized && company && (await prisma.providerCompany.findMany({ where: { name: company } })).length > 0) authorized = true;
    if (!authorized && person_id) {
      const person = await prisma.person.findUnique({ where: { id: person_id } });
      if (person?.productora === userCompany) authorized = true;
      if (!authorized && person?.event_id && assignedEventIds.includes(person.event_id)) authorized = true;
    }
  }
  if (!authorized && (role === 'empresa' || role === 'provider') && company === userCompany) authorized = true;
  if (!authorized) throw Object.assign(new Error('No tenés permiso para crear este documento'), { status: 403 });

  const payload = { person_id: person_id || null, person_name: person_name || '', company: company || '', document_type, original_name, file_url, mime_type: mime_type || '', size: size || 0, status: status || 'pending', event_id: event_id || null, created_by_id: user.id };
  if (expires_at) payload.expires_at = new Date(expires_at);
  if (custom_fields !== undefined) payload.custom_fields = custom_fields;
  const created = await prisma.document.create({ data: payload });
  return { success: true, document: created };
}