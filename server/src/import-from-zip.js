// Importa un ZIP exportado desde la nube (exportData) a la Postgres local.
// Reemplaza los datos locales por los del ZIP (full replace por entidad),
// excepto User que usa upsert por id para no perder el superadmin local.
// Idempotente: re-ejecutar produce el mismo estado.
//
// Uso:  node src/import-from-zip.js [ruta-al-zip]
// Por defecto busca /opt/accreditevent/server/import-data.zip

import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const ENTITY_ORDER = [
  'SystemSetting', 'Company', 'User', 'ProviderCompany', 'Event',
  'EventCompanyApproval', 'Person', 'Accreditation', 'Vehicle', 'Biometric',
  'Document', 'DocumentType', 'AccessLevel', 'ParkingSector', 'PdaStation',
  'DahuaDevice', 'DahuaCommand', 'ZKTecoDevice', 'ZKTecoCommand', 'AccessLog',
  'CustomField', 'PendingOperator', 'AuditLog', 'RequirementItem', 'ProviderRequest',
  // Barras (POS)
  'Bar', 'BarProduct', 'EventProduct', 'BarSale', 'BarOperator', 'BarTablet', 'BarPosDevice',
  'BarCashMovement',
  // Ticketera
  'TicketSale', 'TicketType', 'Ticket',
];

const MODEL_KEY = {
  SystemSetting: 'systemSetting', Company: 'company', User: 'user',
  ProviderCompany: 'providerCompany', Event: 'event',
  EventCompanyApproval: 'eventCompanyApproval', Person: 'person',
  Accreditation: 'accreditation', Vehicle: 'vehicle', Biometric: 'biometric',
  Document: 'document', DocumentType: 'documentType', AccessLevel: 'accessLevel',
  ParkingSector: 'parkingSector', PdaStation: 'pdaStation',
  DahuaDevice: 'dahuaDevice', DahuaCommand: 'dahuaCommand',
  ZKTecoDevice: 'zktecoDevice', ZKTecoCommand: 'zktecoCommand',
  AccessLog: 'accessLog', CustomField: 'customField',
  PendingOperator: 'pendingOperator', AuditLog: 'auditLog',
  RequirementItem: 'requirementItem', ProviderRequest: 'providerRequest',
  // Barras (POS)
  Bar: 'bar', BarProduct: 'barProduct', EventProduct: 'eventProduct',
  BarSale: 'barSale', BarOperator: 'barOperator', BarTablet: 'barTablet',
  BarPosDevice: 'barPosDevice', BarCashMovement: 'barCashMovement',
  // Ticketera
  TicketSale: 'ticketSale', TicketType: 'ticketType', Ticket: 'ticket',
};

// Metadatos de campos por modelo desde el DMMF de Prisma (tipos + listas).
const fieldInfo = {};
for (const m of Prisma.dmmf.datamodel.models) {
  fieldInfo[m.name] = {};
  for (const f of m.fields) {
    if (f.kind === 'scalar') fieldInfo[m.name][f.name] = { type: f.type, isList: f.isList };
  }
}

// Mapea un registro de Base44 al formato Prisma: renombra created_date/updated_date,
// descarta campos que no existen en el modelo, y convierte fechas string → Date.
function convertRecord(entityName, record) {
  const fields = fieldInfo[entityName];
  if (!fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    let fieldName = k;
    if (k === 'created_date') fieldName = 'created_at';
    else if (k === 'updated_date') fieldName = 'updated_at';
    if (!(fieldName in fields)) continue;
    if (v === null || v === undefined) { out[fieldName] = v; continue; }
    const info = fields[fieldName];
    if (info.type === 'DateTime' && typeof v === 'string') {
      out[fieldName] = new Date(v);
    } else {
      out[fieldName] = v;
    }
  }
  return out;
}

async function main() {
  const zipPath = process.argv[2] || '/opt/accreditevent/server/import-data.zip';
  if (!fs.existsSync(zipPath)) {
    console.error(`✗ No se encontró ${zipPath}`);
    console.error('  Copiá el ZIP exportado desde el panel de la nube a esa ruta.');
    process.exit(1);
  }

  const zip = new AdmZip(zipPath);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    console.error('✗ Falta manifest.json en el ZIP — ¿es un export válido?');
    process.exit(1);
  }
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  console.log(`\n📦 Importando exportación v${manifest.version} del ${manifest.exported_at}\n`);

  const report = {};
  for (const entityName of ENTITY_ORDER) {
    const entry = zip.getEntry(`${entityName}.json`);
    if (!entry) { report[entityName] = 'omitido (no en ZIP)'; continue; }
    let records;
    try { records = JSON.parse(entry.getData().toString('utf8')); }
    catch { report[entityName] = 'error de parseo'; continue; }
    if (!Array.isArray(records)) { report[entityName] = 'formato inválido'; continue; }

    const modelKey = MODEL_KEY[entityName];
    const model = prisma[modelKey];
    if (!model) { report[entityName] = 'modelo Prisma no encontrado'; continue; }

    let imported = 0, errors = 0;
    const errorSamples = [];

    if (entityName === 'User') {
      // User: upsert por id, no borrar (preserva superadmin local).
      // password_hash: si el registro no trae uno (viene de la nube), usar placeholder.
      for (const rec of records) {
        try {
          const data = convertRecord(entityName, rec);
          if (!data || !data.id) { errors++; continue; }
          if (!data.password_hash) data.password_hash = '__imported_from_cloud__';
          await model.upsert({
            where: { id: data.id },
            create: data,
            update: { ...data, password_hash: undefined },
          });
          imported++;
        } catch (e) {
          errors++;
          if (errorSamples.length < 3) errorSamples.push(`${rec.id}: ${e.message}`);
        }
      }
    } else {
      // Resto: full replace — borrar todo y crear de a uno (resiliente a errores).
      await model.deleteMany({});
      for (const rec of records) {
        try {
          const data = convertRecord(entityName, rec);
          if (!data || !data.id) { errors++; continue; }
          await model.create({ data });
          imported++;
        } catch (e) {
          errors++;
          if (errorSamples.length < 3) errorSamples.push(`${rec.id}: ${e.message}`);
        }
      }
    }

    report[entityName] = { importados: imported, errores: errors, total: records.length };
    const status = errors === 0 ? '✓' : (imported > 0 ? '⚠' : '✗');
    console.log(`  ${status} ${entityName}: ${imported}/${records.length}${errors ? ` (${errors} errores)` : ''}`);
    if (errorSamples.length) errorSamples.forEach((s) => console.log(`      · ${s}`));
  }

  console.log('\n✅ Importación completada.\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('✗ Error fatal:', e);
  prisma.$disconnect().then(() => process.exit(1));
});