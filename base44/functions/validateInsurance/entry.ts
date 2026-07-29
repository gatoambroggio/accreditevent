import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { document_id } = body;
    if (!document_id) return Response.json({ error: 'document_id es requerido' }, { status: 400 });

    const doc = await base44.entities.Document.get(document_id);
    if (!doc) return Response.json({ error: 'Documento no encontrado' }, { status: 404 });

    let person = null;
    if (doc.person_id) {
      try { person = await base44.entities.Person.get(doc.person_id); } catch {}
    }

    let event = null;
    if (doc.event_id) {
      try { event = await base44.entities.Event.get(doc.event_id); } catch {}
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
          policyholder_dni: { type: 'string', description: 'DNI o número de documento del titular' },
          policy_number: { type: 'string', description: 'Número de póliza' },
          insurance_company: { type: 'string', description: 'Nombre de la aseguradora o ART' },
          coverage_amount: { type: 'number', description: 'Monto de cobertura (valor numérico)' },
          valid_from: { type: 'string', description: 'Fecha de inicio de cobertura en formato YYYY-MM-DD' },
          valid_until: { type: 'string', description: 'Fecha de vencimiento de cobertura en formato YYYY-MM-DD' },
          coverage_type: { type: 'string', description: 'Tipo de cobertura: ART, responsabilidad civil, accidentes personales, etc.' },
          insured_employees: {
            type: 'array',
            description: 'Lista de empleados asegurados que aparecen en la nómina de la póliza',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Nombre completo del empleado asegurado' },
                dni: { type: 'string', description: 'DNI del empleado asegurado' }
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
    const normalizeDni = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const normalizeName = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // DNI validation (person-level)
    const personDni = normalizeDni(person?.document || '');
    const policyDni = normalizeDni(extracted.policyholder_dni || '');
    const dniMatch = !!(personDni && policyDni && personDni === policyDni);

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
    const insuredList = Array.isArray(extracted.insured_employees) ? extracted.insured_employees : [];
    const hasInsuredList = insuredList.length > 0;
    const insuredDnis = new Set(insuredList.map(e => normalizeDni(e.dni)).filter(Boolean));
    const insuredNames = new Set(insuredList.map(e => normalizeName(e.name)).filter(Boolean));

    const reconciliation = companyEmployees.map(emp => {
      const empDni = normalizeDni(emp.document || '');
      const empName = normalizeName(emp.full_name || '');
      const dniMatchEmp = empDni && insuredDnis.has(empDni);
      const nameMatchEmp = empName && insuredNames.has(empName);
      return {
        person_id: emp.id,
        full_name: emp.full_name,
        document: emp.document || '',
        is_covered: dniMatchEmp || nameMatchEmp,
      };
    });

    const coveredCount = reconciliation.filter(e => e.is_covered).length;
    const uncoveredCount = reconciliation.length - coveredCount;

    const employeeValidation = companyEmployees.length > 0 ? {
      company: doc.company || '',
      total_employees: companyEmployees.length,
      insured_in_policy: insuredList.length,
      has_insured_list: hasInsuredList,
      covered_count: coveredCount,
      uncovered_count: uncoveredCount,
      all_covered: !hasInsuredList || uncoveredCount === 0,
      reconciliation,
    } : null;

    // Overall validity — employee coverage only blocks if the policy has a nómina
    const isCompanyLevelDoc = !doc.person_id && !!doc.company;
    const employeeCoverageOk = !employeeValidation || !hasInsuredList || uncoveredCount === 0;
    const overallValid = isCompanyLevelDoc
      ? dateValid && (!eventCoverage || eventCoverage.covers_event) && employeeCoverageOk
      : dniMatch && dateValid && (!eventCoverage || eventCoverage.covers_event) && employeeCoverageOk;

    return Response.json({
      valid: overallValid,
      is_company_level: isCompanyLevelDoc,
      extracted: {
        policyholder_name: extracted.policyholder_name || '',
        policyholder_dni: extracted.policyholder_dni || '',
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
        policy_dni: extracted.policyholder_dni || '',
        date_valid: dateValid,
        date_issues: dateIssues,
        event_coverage: eventCoverage,
        coverage_amount: extracted.coverage_amount || 0,
        employee_validation: employeeValidation
      },
      person: { full_name: person?.full_name || '', document: person?.document || '' },
      event: event ? { name: event.name } : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}