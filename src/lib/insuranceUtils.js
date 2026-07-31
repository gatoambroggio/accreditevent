import { base44 } from '@/api/base44Client';
import { readInsuranceMeta } from '@/lib/insuranceKind';

const INSURANCE_REGEX = /seguro|insurance/i;

const isInsuranceDocType = (docTypeValue) => INSURANCE_REGEX.test(docTypeValue || '');

const isDocExpired = (d) => {
  if (d.status === 'expired') return true;
  if (d.status === 'approved' && d.expires_at && new Date(d.expires_at + 'T23:59:59') < new Date()) return true;
  return false;
};

// Check if a person is covered by a specific approved insurance doc
const isCoveredByDoc = (d, personId) => {
  const cf = d.custom_fields || {};
  if (cf.has_insured_list) {
    // Policy has nómina — person must be in the covered list
    return (cf.covered_person_ids || []).includes(personId);
  }
  // No nómina — general policy, all employees covered
  return true;
};

// Get insurance status for a single person — checks company-level and person-level docs
// Productora users fetch via the getProductoraDocuments backend (RLS blocks provider-company docs)
export async function getInsuranceStatus(person) {
  if (!person) return { insured: false, status: 'none', docs: [], approvedDoc: null };

  const company = person.company || person.productora || '';
  let allDocs = [];

  try {
    const me = await base44.auth.me().catch(() => null);
    const role = me?.data?.role || me?.role || '';

    if (role === 'productora' || role === 'operador') {
      // Service-role backend aggregates docs across the productora's provider companies
      const res = await base44.functions.invoke('getProductoraDocuments', {});
      const backendDocs = res?.data?.documents || [];
      // Person-level docs for this person + company-level docs (no person_id) for this person's company
      allDocs = backendDocs.filter(
        (d) => (d.person_id === person.id) || (d.company === company && !d.person_id)
      );
    } else {
      const personDocs = await base44.entities.Document.filter({ person_id: person.id }, '-created_date', 50);
      allDocs = allDocs.concat(personDocs);

      if (company) {
        const companyDocs = await base44.entities.Document.filter({ company }, '-created_date', 100);
        allDocs = allDocs.concat(companyDocs.filter((d) => !d.person_id));
      }
    }
  } catch {}

  const insuranceDocs = allDocs.filter((d) => isInsuranceDocType(d.document_type));
  const activeInsuranceDocs = insuranceDocs.filter((d) => !isDocExpired(d));
  const approvedDocs = activeInsuranceDocs.filter((d) => d.status === 'approved');
  const approvedDoc = approvedDocs.find((d) => isCoveredByDoc(d, person.id));

  const meta = readInsuranceMeta(approvedDoc);
  return {
    insured: !!approvedDoc,
    status: approvedDoc ? 'approved' : (activeInsuranceDocs.length > 0 ? activeInsuranceDocs[0].status : 'none'),
    docs: insuranceDocs,
    approvedDoc,
    kind: meta.kind,
    amount: meta.amount,
  };
}

// Build a coverage map: { companyName: { allCovered, coveredPersonIds, pending } }
// Includes approved AND pending insurance docs. If an approved doc has no nómina, allCovered = true.
// pending=true indicates at least one insurance doc is pending review for that company.
export async function getInsuranceCoverageMap() {
  try {
    let docs;
    const me = await base44.auth.me().catch(() => null);
    const role = me?.data?.role || me?.role || '';
    if (role === 'productora' || role === 'operador') {
      // Productora RLS blocks provider-company docs; fetch via backend service role
      const res = await base44.functions.invoke('getProductoraDocuments', {});
      docs = res?.data?.documents || [];
    } else {
      docs = await base44.entities.Document.filter({ status: 'approved' }, '-created_date', 500);
    }
    const insuranceDocs = docs.filter((d) => isInsuranceDocType(d.document_type) && d.company && !isDocExpired(d));
    const map = {};
    for (const d of insuranceDocs) {
      const cf = d.custom_fields || {};
      if (!map[d.company]) {
        map[d.company] = { allCovered: false, coveredPersonIds: new Set(), pending: false };
      }
      if (d.status === 'pending') {
        map[d.company].pending = true;
      }
      if (d.status === 'approved') {
        if (!cf.has_insured_list) {
          map[d.company].allCovered = true;
        } else {
          (cf.covered_person_ids || []).forEach(id => map[d.company].coveredPersonIds.add(id));
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

// Helper to check if a person is insured given a coverage map
export function isPersonInsured(person, coverageMap) {
  if (!person || !coverageMap) return false;
  const coverage = coverageMap[person.company];
  if (!coverage) return false;
  if (coverage.allCovered) return true;
  return coverage.coveredPersonIds.has(person.id);
}

// Helper to check if a person has insurance pending review (not yet approved)
export function isPersonInsurancePending(person, coverageMap) {
  if (!person || !coverageMap) return false;
  const coverage = coverageMap[person.company];
  if (!coverage) return false;
  return !!coverage.pending && !isPersonInsured(person, coverageMap);
}