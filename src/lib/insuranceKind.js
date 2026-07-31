// Distinguición entre los dos tipos de seguro: ART y Seguro de Trabajo.
// El seguro de trabajo es el que lleva monto asegurado visible.

export const INSURANCE_KIND_LABELS = {
  ART: 'ART',
  TRABAJO: 'Seguro de trabajo',
};

// Deriva el tipo de seguro ('ART' | 'TRABAJO') a partir del tipo de documento
// y/o el tipo de cobertura detectado por OCR.
export function deriveInsuranceKind(documentType = '', coverageType = '') {
  const dt = (documentType || '').toLowerCase();
  const ct = (coverageType || '').toUpperCase();
  if (dt.includes('art')) return 'ART';
  if (dt.includes('work') || dt.includes('trabajo')) return 'TRABAJO';
  if (ct.includes('ART')) return 'ART';
  if (/TRABAJO|RESPONSABILIDAD CIVIL|ACCIDENTES PERSONALES|\bRC\b/.test(ct)) return 'TRABAJO';
  return 'TRABAJO';
}

export function formatInsuranceAmount(amount) {
  const n = Number(amount || 0);
  if (!n) return '';
  return '$' + n.toLocaleString('es-AR');
}

// Devuelve { kind, amount } desde los custom_fields de un documento aprobado.
export function readInsuranceMeta(doc) {
  const cf = doc?.custom_fields || {};
  return {
    kind: cf.insurance_kind || '',
    amount: Number(cf.coverage_amount || 0),
  };
}