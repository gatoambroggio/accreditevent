// Shared helper to compute insurance status from a list of documents.
// Works for both the empresa portal (company-level + person-level docs) and the
// persona autónoma portal (person-level docs only).

const INSURANCE_REGEX = /seguro|insurance/i;

const isInsuranceDocType = (docTypeValue) => INSURANCE_REGEX.test(docTypeValue || '');

const isDocExpired = (d) => {
  if (d.status === 'expired') return true;
  if (d.status === 'approved' && d.expires_at && new Date(d.expires_at + 'T23:59:59') < new Date()) return true;
  return false;
};

const isCoveredByDoc = (d, personId) => {
  const cf = d.custom_fields || {};
  if (cf.has_insured_list) {
    return (cf.covered_person_ids || []).includes(personId);
  }
  return true;
};

/**
 * Compute insurance status for a person given all relevant docs
 * (person-level + company-level docs are both considered).
 * Returns: { insured, status, label, tone }
 *   tone: 'approved' | 'pending' | 'rejected' | 'expired' | 'none'
 */
export function computeInsuranceStatus(person, allDocs) {
  if (!person) return { insured: false, status: 'none', label: 'Sin seguro', tone: 'none' };
  const company = person.company || person.productora || '';
  const relevant = (allDocs || []).filter(
    (d) => isInsuranceDocType(d.document_type) && (d.person_id === person.id || (d.company === company && !d.person_id))
  );
  const active = relevant.filter((d) => !isDocExpired(d));
  const approvedDocs = active.filter((d) => d.status === 'approved');
  const approvedDoc = approvedDocs.find((d) => isCoveredByDoc(d, person.id));
  if (approvedDoc) return { insured: true, status: 'approved', label: 'Seguro habilitado', tone: 'approved' };
  if (active.length > 0) {
    const s = active[0].status;
    if (s === 'pending') return { insured: false, status: 'pending', label: 'Seguro en revisión', tone: 'pending' };
    if (s === 'rejected') return { insured: false, status: 'rejected', label: 'Seguro rechazado', tone: 'rejected' };
  }
  const expired = relevant.filter((d) => isDocExpired(d));
  if (expired.length > 0 && active.length === 0) {
    return { insured: false, status: 'expired', label: 'Seguro vencido', tone: 'expired' };
  }
  return { insured: false, status: 'none', label: 'Sin seguro', tone: 'none' };
}

// Tailwind class sets for each insurance tone, used by portals.
export const INSURANCE_BADGE_CLASSES = {
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  expired: 'bg-red-50 text-red-700 ring-red-200',
  none: 'bg-slate-100 text-slate-500 ring-slate-200',
};