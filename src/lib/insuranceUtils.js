import { base44 } from '@/api/base44Client';

const INSURANCE_REGEX = /seguro|insurance/i;

const isInsuranceDocType = (docTypeValue) => INSURANCE_REGEX.test(docTypeValue || '');

const isDocExpired = (d) => {
  if (d.status === 'expired') return true;
  if (d.status === 'approved' && d.expires_at && new Date(d.expires_at + 'T23:59:59') < new Date()) return true;
  return false;
};

// Get insurance status for a single person — checks company-level and person-level docs
export async function getInsuranceStatus(person) {
  if (!person) return { insured: false, status: 'none', docs: [], approvedDoc: null };

  const company = person.company || person.productora || '';
  let allDocs = [];

  // Person-level docs
  try {
    const personDocs = await base44.entities.Document.filter({ person_id: person.id }, '-created_date', 50);
    allDocs = allDocs.concat(personDocs);
  } catch {}

  // Company-level docs (no person_id, matching company)
  if (company) {
    try {
      const companyDocs = await base44.entities.Document.filter({ company }, '-created_date', 100);
      allDocs = allDocs.concat(companyDocs.filter((d) => !d.person_id));
    } catch {}
  }

  const insuranceDocs = allDocs.filter((d) => isInsuranceDocType(d.document_type));
  const activeInsuranceDocs = insuranceDocs.filter((d) => !isDocExpired(d));
  const approvedDoc = activeInsuranceDocs.find((d) => d.status === 'approved');

  return {
    insured: !!approvedDoc,
    status: approvedDoc ? 'approved' : (activeInsuranceDocs.length > 0 ? activeInsuranceDocs[0].status : 'none'),
    docs: insuranceDocs,
    approvedDoc,
  };
}

// Build a set of company names that have approved insurance (for bulk filtering in directory views)
export async function getInsuredCompanies() {
  try {
    const docs = await base44.entities.Document.filter({ status: 'approved' }, '-created_date', 500);
    const insuranceDocs = docs.filter((d) => isInsuranceDocType(d.document_type) && d.company && !isDocExpired(d));
    return new Set(insuranceDocs.map((d) => d.company));
  } catch {
    return new Set();
  }
}