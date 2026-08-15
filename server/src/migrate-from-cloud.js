// Migración de datos desde la nube de Base44 a la Postgres local.
// Exporta las entidades vía SDK de Base44 (token de service role o admin) y
// los inserta en la base local preservando IDs, relaciones y fechas.
//
// Uso:
//   BASE44_API_URL=https://api.base44.com  (o el de tu app)
//   BASE44_ADMIN_TOKEN=<token-jwt-del-superadmin-de-la-app-cloud>
//   node src/migrate-from-cloud.js
//
// En air-gap esto se corre UNA vez (con internet a la nube) ANTES de desconectar.
// Preserva IDs hex de 24 chars para que QR/badge codes sigan válidos.

import dotenv from 'dotenv';
import { prisma } from '../db/prisma.js';
dotenv.config();

const API = process.env.BASE44_API_URL;
const TOKEN = process.env.BASE44_ADMIN_TOKEN;
if (!API || !TOKEN) { console.error('Falta BASE44_API_URL o BASE44_ADMIN_TOKEN'); process.exit(1); }

// Entidades a migrar en orden de dependencia (padres antes que hijos).
const ORDER = [
  'SystemSetting', 'Company', 'ProviderCompany', 'AccessLevel', 'ParkingSector',
  'DocumentType', 'CustomField', 'RequirementItem',
  'User', 'Event', 'EventCompanyApproval',
  'Person', 'Accreditation', 'Vehicle', 'Biometric', 'Document',
  'PdaStation', 'ProviderRequest', 'PendingOperator',
  'DahuaDevice', 'ZKTecoDevice', 'AccessLog', 'AuditLog',
];

// Mapeo entidad → tabla Prisma.
const MODEL = {
  SystemSetting: 'systemSetting', Company: 'company', ProviderCompany: 'providerCompany',
  AccessLevel: 'accessLevel', ParkingSector: 'parkingSector', DocumentType: 'documentType',
  CustomField: 'customField', RequirementItem: 'requirementItem', User: 'user',
  Event: 'event', EventCompanyApproval: 'eventCompanyApproval', Person: 'person',
  Accreditation: 'accreditation', Vehicle: 'vehicle', Biometric: 'biometric',
  Document: 'document', PdaStation: 'pdaStation', ProviderRequest: 'providerRequest',
  PendingOperator: 'pendingOperator', DahuaDevice: 'dahuaDevice', ZKTecoDevice: 'zkTecoDevice',
  AccessLog: 'accessLog', AuditLog: 'auditLog',
};

async function fetchAllCloud(entityName) {
  const all = [];
  let skip = 0;
  const PAGE = 500;
  while (true) {
    const url = `${API}/v1/entities/${entityName}?limit=${PAGE}&skip=${skip}&sort=-created_date`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) { console.error(`  ${entityName}: HTTP ${res.status} — salteando`); return []; }
    const batch = await res.json();
    if (!Array.isArray(batch)) { console.error(`  ${entityName}: respuesta inesperada`); return []; }
    all.push(...batch);
    if (batch.length < PAGE) break;
    skip += PAGE;
    if (skip > 20000) break;
  }
  return all;
}

// Convierte campos de fecha string a Date para Prisma.
function coerceDates(rec, dateFields) {
  for (const f of dateFields) {
    if (rec[f] && typeof rec[f] === 'string') rec[f] = new Date(rec[f]);
    else if (rec[f] === null) delete rec[f];
  }
  return rec;
}

const DATE_FIELDS = ['start_at', 'end_at', 'armado_start', 'armado_end', 'desarme_start', 'desarme_end', 'pickup_date', 'expires_at', 'reviewed_at', 'last_seen', 'load_start_date', 'load_end_date', 'expiry_notified_at'];

async function migrateEntity(entityName) {
  const records = await fetchAllCloud(entityName);
  if (!records.length) { console.log(`  ${entityName}: sin registros`); return 0; }
  const model = prisma[MODEL[entityName]];
  if (!model) { console.error(`  ${entityName}: sin modelo Prisma`); return 0; }

  let inserted = 0, failed = 0;
  for (const raw of records) {
    try {
      const rec = { ...raw };
      // Preserva ID (Base44 usa hex 24; Prisma usa cuid por defecto pero el campo id es String)
      if (rec.id && /^[a-f0-9]{24}$/.test(rec.id)) {
        // upsert para no duplicar si se re-corre
        rec.id = rec.id;
      }
      coerceDates(rec, DATE_FIELDS);
      // created_date/updated_date → created_at/updated_at
      if (rec.created_date) rec.created_at = new Date(rec.created_date);
      if (rec.updated_date) rec.updated_at = new Date(rec.updated_date);
      delete rec.created_date; delete rec.updated_date;
      // Elimina campos nulos que pisen defaults
      Object.keys(rec).forEach((k) => rec[k] === null && delete rec[k]);
      await model.upsert({ where: { id: rec.id }, create: rec, update: {} });
      inserted++;
    } catch (e) { failed++; if (failed <= 3) console.error(`    ${entityName} ${raw.id}: ${e.message}`); }
  }
  console.log(`  ${entityName}: ${inserted} insertados, ${failed} fallidos (de ${records.length})`);
  return inserted;
}

async function main() {
  console.log('[migrate] Base de destino: conectando...');
  await prisma.$connect();
  console.log('[migrate] Migrando entidades desde la nube (preservando IDs)...');
  let total = 0;
  for (const e of ORDER) total += await migrateEntity(e);
  console.log(`\n[migrate] Listo. ${total} registros migrados a la base local.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });