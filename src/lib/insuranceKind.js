// Distinguición entre los dos tipos de seguro: ART y AP (Accidentes Personales).
// ART (Aseguradora de Riesgos del Trabajo) no lleva monto de cobertura.
// AP (Accidentes Personales) sí lleva monto asegurado visible.

export const INSURANCE_KIND_LABELS = {
  ART: 'ART',
  AP: 'Accidentes Personales',
};

// Deriva el tipo de seguro ('ART' | 'AP') a partir del tipo de documento
// y/o el tipo de cobertura detectado por OCR.
export function deriveInsuranceKind(documentType = '', coverageType = '') {
  const dt = (documentType || '').toLowerCase();
  const ct = (coverageType || '').toUpperCase();
  if (dt.includes('art')) return 'ART';
  if (dt.includes('work') || dt.includes('trabajo') || dt.includes('personal') || dt.includes('ap')) return 'AP';
  if (ct.includes('ART')) return 'ART';
  if (/ACCIDENTES PERSONALES|\bAP\b|TRABAJO|RESPONSABILIDAD CIVIL|\bRC\b/.test(ct)) return 'AP';
  return 'AP';
}

// ART no lleva monto de cobertura; AP sí.
export function hasCoverageAmount(kind) {
  return kind === 'AP';
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