import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import JSZip from 'npm:jszip@3.10.1';

// Exporta TODAS las entidades a un ZIP descargable para migrar de la nube
// al servidor self-hosted. Solo admin/superadmin. Usa asServiceRole para
// saltar RLS y leer todos los registros, con paginación por skip.

const ENTITIES = [
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

async function fetchAll(base44, name) {
  const all = [];
  let skip = 0;
  const BATCH = 500;
  while (true) {
    const batch = await base44.asServiceRole.entities[name].list('-created_date', BATCH, skip);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < BATCH) break;
    skip += BATCH;
  }
  return all;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return Response.json({ error: 'Forbidden — solo administradores' }, { status: 403 });
    }

    const zip = new JSZip();
    const manifest = {
      version: 1,
      exported_at: new Date().toISOString(),
      app: 'accreditevent',
      entities: {},
    };

    for (const name of ENTITIES) {
      try {
        const records = await fetchAll(base44, name);
        manifest.entities[name] = records.length;
        zip.file(`${name}.json`, JSON.stringify(records));
      } catch (err) {
        manifest.entities[name] = { error: err.message };
      }
    }

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const base64 = await zip.generateAsync({ type: 'base64' });

    return Response.json({
      zip_base64: base64,
      filename: `accreditevent-export-${new Date().toISOString().slice(0, 10)}.zip`,
      manifest,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}