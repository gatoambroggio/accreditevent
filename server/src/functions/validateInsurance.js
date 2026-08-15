import Tesseract from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

// Validación de seguro air-gapped: OCR del documento con Tesseract + matching
// determinista de cláusulas/DNI/montos contra la póliza. Reemplaza el
// ExtractDataFromUploadedFile + InvokeLLM de Base44 (sin internet).

function dniToBase(s) { const d = (s || '').replace(/\D/g, ''); return d.length === 11 ? d.substring(2, 10) : d; }
function normalizeName(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function digitsOf(s) { return (s || '').replace(/\D/g, ''); }

export async function validateInsurance({ document_id, event_id }, { user, prisma }) {
  if (!document_id) throw Object.assign(new Error('document_id requerido'), { status: 400 });
  const doc = await prisma.document.findUnique({ where: { id: document_id } });
  if (!doc) throw Object.assign(new Error('Documento no encontrado'), { status: 404 });

  let person = null;
  if (doc.person_id) person = await prisma.person.findUnique({ where: { id: doc.person_id } });
  let event = null;
  const evId = event_id || doc.event_id;
  if (evId) event = await prisma.event.findUnique({ where: { id: evId } });

  let companyEmployees = [];
  if (doc.company) companyEmployees = await prisma.person.findMany({ where: { company: doc.company, tipo_vinculo: 'empresa' } });

  // --- OCR del archivo con Tesseract ---
  let filePath = doc.file_url;
  if (typeof doc.file_url === 'string' && doc.file_url.startsWith('http')) {
    const rel = doc.file_url.replace(env.lanBaseUrl, '');
    const cand = path.resolve(rel.replace(/^\//, ''));
    filePath = fs.existsSync(cand) ? cand : path.join(env.uploadDir, path.basename(rel));
  }
  if (!fs.existsSync(filePath)) throw Object.assign(new Error('Archivo no encontrado: ' + filePath), { status: 422 });

  let ocrText = '';
  try {
    const { data } = await Tesseract.recognize(filePath, 'spa', { logger: () => {} });
    ocrText = (data?.text || '').toLowerCase();
  } catch (e) {
    return { error: 'No se pudo leer el documento (OCR falló): ' + e.message, raw: '' };
  }

  // --- Extracción determinista de campos ---
  const allDigits = (ocrText.match(/\d[\d.\-]{6,}/g) || []).map(digitsOf);
  const detectedKind = /art|aseguradora de riesgos/.test(ocrText) || /art/.test((doc.document_type || '').toLowerCase()) ? 'ART' : 'AP';
  let requiredKind = '';
  const providers = await prisma.providerCompany.findMany();
  const provider = providers.find((p) => (p.name || '').toUpperCase() === (doc.company || '').toUpperCase());
  requiredKind = provider?.insurance_kind || '';
  const kindMatch = !requiredKind || detectedKind === requiredKind;

  // Monto: busca números grandes cerca de "monto" / "suma" / "$"
  let coverageAmount = 0;
  const amountMatch = ocrText.match(/(?:monto|suma|capital)[^\d]{0,20}(\d[\d.]{5,})/);
  if (amountMatch) coverageAmount = Number(amountMatch[1].replace(/\./g, ''));

  // Fechas: busca YYYY-MM-DD o DD/MM/YYYY
  const dates = [...ocrText.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map((m) => ({ raw: m[0], d: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) }));
  let validFrom = null, validUntil = null;
  if (dates.length >= 2) { dates.sort((a, b) => a.d - b.d); validFrom = dates[0].d; validUntil = dates[dates.length - 1].d; }
  else if (dates.length === 1) validUntil = dates[0].d;

  // --- Validaciones ---
  const personDniBase = dniToBase(person?.document || '');
  const policyDniBase = personDniBase ? (allDigits.some((d) => d.includes(personDniBase) || personDniBase.includes(d)) ? personDniBase : '') : '';
  const dniMatch = !!(personDniBase && allDigits.some((d) => d.includes(personDniBase) || personDniBase.includes(d) || dniToBase(d) === personDniBase));

  const now = new Date();
  let dateValid = false;
  const dateIssues = [];
  if (!validUntil) dateIssues.push('No se encontró fecha de vencimiento');
  else if (validUntil < now) dateIssues.push('La póliza está vencida');
  else dateValid = true;
  if (validFrom && validFrom > now) { dateIssues.push('La póliza aún no está vigente'); dateValid = false; }

  let eventCoverage = null;
  if (event) {
    const es = event.armado_start || event.start_at, ee = event.desarme_end || event.end_at;
    if (es && ee) {
      const cs = !validFrom || validFrom <= es, ce = !validUntil || validUntil >= ee;
      eventCoverage = { event_name: event.name, covers_start: cs, covers_end: ce, covers_event: cs && ce };
      if (!cs) dateIssues.push('No cubre el inicio del armado');
      if (!ce) dateIssues.push('No cubre el fin del desarme');
    }
  }

  // Reconciliación de empleados (ART a nivel empresa)
  const insuredDnis = new Set(allDigits.map(dniToBase).filter((d) => d.length >= 6));
  const reconciliation = companyEmployees.map((emp) => {
    const empDniBase = dniToBase(emp.document || '');
    const nameMatch = normalizeName(emp.full_name) && ocrText.includes(normalizeName(emp.full_name).split(' ')[0]);
    const dniMatchEmp = empDniBase && insuredDnis.has(empDniBase);
    return { person_id: emp.id, full_name: emp.full_name, document: emp.document || '', is_covered: dniMatchEmp || nameMatch, match_method: dniMatchEmp ? 'dni' : (nameMatch ? 'name' : 'none') };
  });

  // Cláusulas de no repetición (matching determinista por DNI/nombre)
  const nonRepetitionClauses = Array.isArray(event?.insurance_non_repetition_clauses) ? event.insurance_non_repetition_clauses.map((c) => c.trim()).filter(Boolean) : [];
  let clauseValidation = null;
  if (nonRepetitionClauses.length > 0) {
    const clauseLines = nonRepetitionClauses.flatMap((c) => c.split(/\n+/).map((l) => l.trim()).filter(Boolean));
    const clausesResult = clauseLines.map((c) => {
      const digits = (c.match(/\d[\d.\-]{5,}/g) || []).map(digitsOf);
      const found = digits.some((d) => insuredDnis.has(dniToBase(d)) || insuredDnis.has(d));
      const nm = normalizeName(c).split(' ')[0];
      const nameFound = nm && nm.length > 2 && ocrText.includes(nm);
      return { clause: c, found: found || nameFound, excerpt: found ? 'DNI presente' : (nameFound ? 'Nombre presente' : 'No encontrado') };
    });
    clauseValidation = { clauses: clausesResult, all_found: clausesResult.every((c) => c.found) };
  }
  const nonRepetitionOk = nonRepetitionClauses.length === 0 || clauseValidation?.all_found;

  const requiredAmount = event?.insurance_insured_amount || 0;
  const docAmount = coverageAmount || 0;
  const amountOk = detectedKind === 'ART' ? true : (!requiredAmount || docAmount >= requiredAmount);

  const insuranceIssues = [];
  if (nonRepetitionClauses.length > 0 && !nonRepetitionOk) insuranceIssues.push('Faltan cláusulas de no repetición');
  if (detectedKind !== 'ART' && requiredAmount && docAmount < requiredAmount) insuranceIssues.push('Monto asegurado insuficiente');
  if (requiredKind && !kindMatch) insuranceIssues.push(`Tipo detectado (${detectedKind}) != requerido (${requiredKind})`);

  const isCompanyLevelDoc = !doc.person_id && !!doc.company;
  const overallValid = isCompanyLevelDoc
    ? dateValid && (!eventCoverage || eventCoverage.covers_event) && nonRepetitionOk && amountOk && kindMatch
    : dniMatch && dateValid && (!eventCoverage || eventCoverage.covers_event) && nonRepetitionOk && amountOk && kindMatch;

  return {
    valid: overallValid, is_company_level: isCompanyLevelDoc,
    extracted: { policy_number: '', insurance_company: '', coverage_amount: docAmount, valid_from: validFrom?.toISOString() || '', valid_until: validUntil?.toISOString() || '', coverage_type: detectedKind, insurance_kind: detectedKind },
    validation: { dni_match: dniMatch, person_dni: person?.document || '', policy_dni_base: policyDniBase, date_valid: dateValid, date_issues: dateIssues, event_coverage: eventCoverage, coverage_amount: docAmount, detected_kind: detectedKind, required_kind: requiredKind, kind_match: kindMatch, insurance_config: { non_repetition_clauses: nonRepetitionClauses, clause_validation: clauseValidation, non_repetition_ok: nonRepetitionOk, required_amount: requiredAmount, document_amount: docAmount, amount_ok: amountOk, issues: insuranceIssues }, employee_validation: companyEmployees.length > 0 ? { company: doc.company, total_employees: companyEmployees.length, covered_count: reconciliation.filter((e) => e.is_covered).length, uncovered_count: reconciliation.filter((e) => !e.is_covered).length, reconciliation } : null },
    person: { full_name: person?.full_name || '', document: person?.document || '' }, event: event ? { name: event.name } : null,
  };
}