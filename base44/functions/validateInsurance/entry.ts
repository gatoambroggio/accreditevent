import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { document_id, event_id } = body;
    if (!document_id) return Response.json({ error: 'document_id es requerido' }, { status: 400 });

    const doc = await base44.entities.Document.get(document_id);
    if (!doc) return Response.json({ error: 'Documento no encontrado' }, { status: 404 });

    let person = null;
    if (doc.person_id) {
      try { person = await base44.entities.Person.get(doc.person_id); } catch {}
    }

    let event = null;
    const eventIdToUse = event_id || doc.event_id;
    if (eventIdToUse) {
      try { event = await base44.entities.Event.get(eventIdToUse); } catch {}
    }

    // Load company employees for reconciliation
    let companyEmployees = [];
    if (doc.company) {
      try {
        companyEmployees = await base44.entities.Person.filter(
          { company: doc.company, tipo_vinculo: 'empresa' },
          '-created_date', 500
        );
      } catch {}
    }

    const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: doc.file_url,
      json_schema: {
        type: 'object',
        properties: {
          policyholder_name: { type: 'string', description: 'Nombre completo del titular del seguro' },
          policyholder_dni: { type: 'string', description: 'DNI o número de documento del titular. Puede venir como CUIT/CUIL (11 dígitos) o DNI (7-8 dígitos)' },
          policy_number: { type: 'string', description: 'Número de póliza' },
          insurance_company: { type: 'string', description: 'Nombre de la aseguradora o ART' },
          coverage_amount: { type: 'number', description: 'Monto de cobertura (valor numérico)' },
          valid_from: { type: 'string', description: 'Fecha de inicio de cobertura en formato YYYY-MM-DD' },
          valid_until: { type: 'string', description: 'Fecha de vencimiento de cobertura en formato YYYY-MM-DD' },
          coverage_type: { type: 'string', description: 'Tipo de cobertura: ART, responsabilidad civil, accidentes personales, etc.' },
          insured_employees: {
            type: 'array',
            description: 'Lista de empleados asegurados que aparecen en la nómina de la póliza. Incluir todos los nombres y DNI/CUIT/CUIL que aparezcan',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Nombre completo del empleado asegurado' },
                dni: { type: 'string', description: 'DNI o CUIT/CUIL del empleado asegurado' }
              }
            }
          }
        }
      }
    });

    if (extractResult.status !== 'success' || !extractResult.output) {
      return Response.json({
        error: 'No se pudieron extraer datos del documento. Verificá que el archivo sea legible.',
        raw: extractResult.details || ''
      }, { status: 422 });
    }

    const extracted = extractResult.output;

    // Normalize helpers
    const normalizeName = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // Extract base DNI — handles CUIT/CUIL (11 digits) by stripping first 2 and last 1 digit
    const dniToBase = (s) => {
      const digits = (s || '').replace(/\D/g, '');
      if (digits.length === 11) return digits.substring(2, 10);
      return digits;
    };

    // DNI validation (person-level) — compares base DNI, handling CUIT/CUIL
    const personDniBase = dniToBase(person?.document || '');
    const policyDniBase = dniToBase(extracted.policyholder_dni || '');
    const dniMatch = !!(personDniBase && policyDniBase && personDniBase === policyDniBase);
    const policyDniWasCuit = (extracted.policyholder_dni || '').replace(/\D/g, '').length === 11;

    // Date validation
    const now = new Date();
    let dateValid = false;
    const dateIssues = [];
    let validFrom = extracted.valid_from ? new Date(extracted.valid_from) : null;
    let validUntil = extracted.valid_until ? new Date(extracted.valid_until) : null;

    if (validFrom && isNaN(validFrom.getTime())) validFrom = null;
    if (validUntil && isNaN(validUntil.getTime())) validUntil = null;

    if (!validUntil) {
      dateIssues.push('No se encontró fecha de vencimiento en la póliza');
    } else if (validUntil < now) {
      dateIssues.push('La póliza está vencida');
    } else {
      dateValid = true;
    }

    if (validFrom && validFrom > now) {
      dateIssues.push('La póliza aún no está vigente (inicia en el futuro)');
      dateValid = false;
    }

    // Event coverage validation
    let eventCoverage = null;
    if (event) {
      const eventStart = event.armado_start ? new Date(event.armado_start) : (event.start_at ? new Date(event.start_at) : null);
      const eventEnd = event.desarme_end ? new Date(event.desarme_end) : (event.end_at ? new Date(event.end_at) : null);
      if (eventStart && eventEnd) {
        const coversStart = !validFrom || validFrom <= eventStart;
        const coversEnd = !validUntil || validUntil >= eventEnd;
        eventCoverage = {
          event_name: event.name,
          event_start: eventStart.toISOString(),
          event_end: eventEnd.toISOString(),
          covers_start: coversStart,
          covers_end: coversEnd,
          covers_event: coversStart && coversEnd
        };
        if (!coversStart) dateIssues.push('La póliza no cubre el inicio del armado del evento');
        if (!coversEnd) dateIssues.push('La póliza no cubre el fin del desarme del evento');
      }
    }

    // Employee reconciliation (company-level ART insurance)
    // Match primarily by DNI (handles CUIT/CUIL), with name as fallback
    const insuredList = Array.isArray(extracted.insured_employees) ? extracted.insured_employees : [];
    const hasInsuredList = insuredList.length > 0;
    const insuredDnis = new Set(insuredList.map(e => dniToBase(e.dni)).filter(Boolean));
    const insuredNames = new Set(insuredList.map(e => normalizeName(e.name)).filter(Boolean));
    const insuredCuitCount = insuredList.filter(e => (e.dni || '').replace(/\D/g, '').length === 11).length;

    const reconciliation = companyEmployees.map(emp => {
      const empDniBase = dniToBase(emp.document || '');
      const empName = normalizeName(emp.full_name || '');
      const dniMatchEmp = empDniBase && insuredDnis.has(empDniBase);
      const nameMatchEmp = empName && insuredNames.has(empName);
      return {
        person_id: emp.id,
        full_name: emp.full_name,
        document: emp.document || '',
        is_covered: dniMatchEmp || nameMatchEmp,
        match_method: dniMatchEmp ? 'dni' : (nameMatchEmp ? 'name' : 'none'),
      };
    });

    // Insurance config validation (event-level requirements)
    const nonRepetitionClauses = Array.isArray(event?.insurance_non_repetition_clauses)
      ? event.insurance_non_repetition_clauses.map(c => (c || '').trim()).filter(Boolean)
      : [];

    // Verify each non-repetition clause is present in the document using LLM
    let clauseValidation = null;
    if (nonRepetitionClauses.length > 0) {
      try {
        const clausePrompt = `Analizá el siguiente documento de póliza de seguro. Verificá si cada una de las siguientes cláusulas está presente en el documento. Para cada cláusula, indicá si está presente (true/false) y, si lo está, un breve extracto del texto que coincide.\n\nCláusulas a verificar:\n${nonRepetitionClauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
        const clauseResult = await base44.integrations.Core.InvokeLLM({
          prompt: clausePrompt,
          file_urls: [doc.file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              clauses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    clause: { type: 'string', description: 'Texto de la cláusula verificada' },
                    found: { type: 'boolean', description: 'Indica si la cláusula está presente en el documento' },
                    excerpt: { type: 'string', description: 'Extracto del texto encontrado en el documento que coincide con la cláusula' }
                  }
                }
              },
              all_found: { type: 'boolean', description: 'Indica si todas las cláusulas fueron encontradas' }
            }
          }
        });
        clauseValidation = clauseResult;
      } catch (e) {
        clauseValidation = { error: e.message, clauses: [], all_found: false };
      }
    }

    const nonRepetitionOk = nonRepetitionClauses.length === 0 || (clauseValidation?.all_found === true);

    const requiredAmount = event?.insurance_insured_amount || 0;
    const docAmount = extracted.coverage_amount || 0;
    const amountOk = !requiredAmount || docAmount >= requiredAmount;

    const insuranceIssues = [];
    if (nonRepetitionClauses.length > 0 && !nonRepetitionOk) {
      const missing = (clauseValidation?.clauses || []).filter(c => !c.found).map(c => c.clause);
      insuranceIssues.push(`Faltan ${missing.length} cláusula(s) de no repetición en la póliza`);
    }
    if (requiredAmount && docAmount < requiredAmount) {
      insuranceIssues.push(`El monto asegurado ($${docAmount.toLocaleString('es-AR')}) es menor al mínimo requerido ($${requiredAmount.toLocaleString('es-AR')})`);
    }

    const coveredCount = reconciliation.filter(e => e.is_covered).length;
    const uncoveredCount = reconciliation.length - coveredCount;

    const employeeValidation = companyEmployees.length > 0 ? {
      company: doc.company || '',
      total_employees: companyEmployees.length,
      insured_in_policy: insuredList.length,
      has_insured_list: hasInsuredList,
      cuit_count: insuredCuitCount,
      covered_count: coveredCount,
      uncovered_count: uncoveredCount,
      all_covered: !hasInsuredList || uncoveredCount === 0,
      reconciliation,
    } : null;

    // Overall validity — employee coverage only blocks if the policy has a nómina
    const isCompanyLevelDoc = !doc.person_id && !!doc.company;
    const employeeCoverageOk = !employeeValidation || !hasInsuredList || uncoveredCount === 0;
    const overallValid = isCompanyLevelDoc
      ? dateValid && (!eventCoverage || eventCoverage.covers_event) && employeeCoverageOk && nonRepetitionOk && amountOk
      : dniMatch && dateValid && (!eventCoverage || eventCoverage.covers_event) && employeeCoverageOk && nonRepetitionOk && amountOk;

    return Response.json({
      valid: overallValid,
      is_company_level: isCompanyLevelDoc,
      extracted: {
        policyholder_name: extracted.policyholder_name || '',
        policyholder_dni: extracted.policyholder_dni || '',
        policy_dni_was_cuit: policyDniWasCuit,
        policy_dni_base: policyDniBase,
        policy_number: extracted.policy_number || '',
        insurance_company: extracted.insurance_company || '',
        coverage_amount: extracted.coverage_amount || 0,
        valid_from: extracted.valid_from || '',
        valid_until: extracted.valid_until || '',
        coverage_type: extracted.coverage_type || ''
      },
      validation: {
        dni_match: dniMatch,
        person_dni: person?.document || '',
        person_dni_base: personDniBase,
        policy_dni: extracted.policyholder_dni || '',
        policy_dni_base: policyDniBase,
        date_valid: dateValid,
        date_issues: dateIssues,
        event_coverage: eventCoverage,
        coverage_amount: extracted.coverage_amount || 0,
        insurance_config: {
          non_repetition_clauses: nonRepetitionClauses,
          clause_validation: clauseValidation,
          non_repetition_ok: nonRepetitionOk,
          required_amount: requiredAmount,
          document_amount: docAmount,
          amount_ok: amountOk,
          issues: insuranceIssues,
        },
        employee_validation: employeeValidation
      },
      person: { full_name: person?.full_name || '', document: person?.document || '' },
      event: event ? { name: event.name } : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}