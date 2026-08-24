// Exporta toda la data del sistema a un ZIP (mismo formato que lee
// import-from-zip.js): un .json por entidad + manifest.json. Sirve como
// backup del servidor local y para migrar de una instancia a otra.
//
// Devuelve { zip_base64, filename, manifest } — igual que el exportData
// de la nube, así el panel (Settings.jsx) no cambia.

import AdmZip from 'adm-zip';

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

// Renombra created_at/updated_at → created_date/updated_date (convención Base44)
// para que el ZIP sea idéntico al export de la nube e importable por la misma vía.
function toBase44(record) {
  if (!record) return record;
  const out = { ...record };
  if ('created_at' in out) { out.created_date = out.created_at; delete out.created_at; }
  if ('updated_at' in out) { out.updated_date = out.updated_at; delete out.updated_at; }
  return out;
}

export async function exportData(_payload, { prisma } = {}) {
  const p = prisma || (await import('../db/prisma.js')).prisma;
  const zip = new AdmZip();
  const manifest = { version: 1, exported_at: new Date().toISOString(), entities: {} };

  for (const entityName of ENTITY_ORDER) {
    const modelKey = MODEL_KEY[entityName];
    const model = p[modelKey];
    if (!model) continue;
    const records = await model.findMany();
    const mapped = records.map(toBase44);
    zip.addFile(`${entityName}.json`, Buffer.from(JSON.stringify(mapped), 'utf8'));
    manifest.entities[entityName] = mapped.length;
  }

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  const buf = zip.toBuffer();
  const filename = `accreditevent-export-${new Date().toISOString().slice(0, 10)}.zip`;
  return { zip_base64: buf.toString('base64'), filename, manifest };
}