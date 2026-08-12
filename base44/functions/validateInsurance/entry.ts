import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { document_id, event_id } = body;
    if (!document_id) return Response.json({ error: 'document_id es requerido' }, { status: 400 });

    // Use service role to bypass RLS — the function authenticates the user separately
    // and the productora's RLS would block reading provider-company docs
    const doc = await base44.asServiceRole.entities.Document.get(document_id);
    if (!doc) return Response.json({ error: 'Documento no encontrado' }, { status: 404 });

    let person = null;
    if (doc.person_id) {
      try { person = await base44.asServiceRole.entities.Person.get(doc.person_id); } catch {}
    }

    let event = null;
    const eventIdToUse = event_id || doc.event_id;
    if (eventIdToUse) {
      try { event = await base44.asServiceRole.entities.Event.get(eventIdToUse); } catch {}
    }

    // Load company employees for reconciliation
    let companyEmployees = [];
    if (doc.company) {
      try {
        companyEmployees = await base44.asServiceRole.entities.Person.filter(
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
          },
          all_document_numbers: {
            type: 'array',
            description: 'Lista de TODOS los números de documento (DNI, CUIT, CUIL) que aparezcan en cualquier parte del documento (nómina, encabezado, pie, anexos), tal como aparecen. Ej: "20-08531478-6", "08531478", "30-70843115-6". No omitir ninguno.',
            items: { type: 'string' }
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

    // Determinar tipo de seguro (ART / AP) desde OCR + tipo de documento
    const detectKind = (documentType: string, coverageType: string) => {
      const dt = (documentType || '').toLowerCase();
      const ct = (coverageType || '').toUpperCase();
      if (dt.includes('art')) return 'ART';
      if (dt.includes('work') || dt.includes('trabajo') || dt.includes('personal') || dt.includes('ap')) return 'AP';
      if (ct.includes('ART')) return 'ART';
      if (/ACCIDENTES PERSONALES|\bAP\b|TRABAJO|RESPONSABILIDAD CIVIL|\bRC\b/.test(ct)) return 'AP';
      return 'AP';
    };
    const detectedKind = detectKind(doc.document_type, extracted.coverage_type);

    // Tipo de seguro requerido por la empresa proveedora
    let requiredKind = '';
    try {
      const providers = await base44.asServiceRole.entities.ProviderCompany.list('-created_date', 500);
      const provider = providers.find((p) => (p.name || '').toUpperCase() === (doc.company || '').toUpperCase());
      requiredKind = (provider as any)?.insurance_kind || '';
    } catch {}
    const kindMatch = !requiredKind || detectedKind === requiredKind;

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
    // Respaldo: números sueltos del documento (no solo nómina estructurada)
    const allDocNums: any[] = Array.isArray((extracted as any).all_document_numbers) ? (extracted as any).all_document_numbers : [];
    for (const num of allDocNums) {
      const base = dniToBase(num || '');
      if (base) insuredDnis.add(base as string);
    }

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
      // Las "cláusulas de no repetición" del evento suelen ser una lista de
      // personas (nombre + CUIT/CUIL/DNI) que deben figurar en la póliza. Las
      // verificamos contra la nómina extraída por OCR (insured_employees + titular),
      // matching por DNI base (maneja CUIT/CUIL) y por nombre. Es determinístico,
      // rápido y sin segunda llamada LLM (evita timeout). Para cláusulas que no
      // son personas (texto legal sin CUIT), caemos a LLM con el archivo.
      const stripAccents = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normName = (s: string) => stripAccents(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      const digitsOf = (s: string) => (s || '').replace(/\D/g, '');

      const insuredDniBases = new Set<string>();
      const insuredNameSet = new Set<string>();
      for (const e of insuredList) {
        const d = digitsOf(e.dni || '');
        if (d) insuredDniBases.add((dniToBase(e.dni || '') as string) || d);
        const nm = normName(e.name || '');
        if (nm) insuredNameSet.add(nm);
      }
      const phDni = digitsOf(extracted.policyholder_dni || '');
      if (phDni) insuredDniBases.add((dniToBase(extracted.policyholder_dni || '') as string) || phDni);
      const phName = normName(extracted.policyholder_name || '');
      if (phName) insuredNameSet.add(phName);
      // Respaldo: todos los CUIT/DNI que aparezcan en cualquier parte del
      // documento (no solo en la nómina estructurada). Esto recupera filas
      // que el OCR omitió en insured_employees pero que sí leyó como texto.
      const allDocNumbers: any[] = Array.isArray((extracted as any).all_document_numbers) ? (extracted as any).all_document_numbers : [];
      for (const num of allDocNumbers) {
        const d = digitsOf(num || '');
        if (d) {
          const base = (dniToBase(num || '') as string) || d;
          if (base && base.length >= 6) insuredDniBases.add(base);
          if (d.length >= 6) insuredDniBases.add(d);
        }
      }

      const tokenOverlap = (a: string, b: string) => {
        const ta = new Set(a.split(' ').filter((w) => w.length >= 3));
        const tb = b.split(' ').filter((w) => w.length >= 3);
        if (!ta.size || !tb.length) return 0;
        let hit = 0;
        for (const w of tb) if (ta.has(w)) hit++;
        return hit / tb.length;
      };

      // Expandir cláusulas multi-línea en entradas individuales (una por línea)
      // para dar resultado granular por persona.
      const clauseLines: string[] = [];
      for (const clause of nonRepetitionClauses) {
        const lines = clause.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 1) clauseLines.push(...lines);
        else clauseLines.push(clause.trim());
      }

      // Separar líneas tipo "persona" (con CUIT/DNI) del resto (texto legal)
      const personClauses: { idx: number; clause: string; digitRuns: string[] }[] = [];
      clauseLines.forEach((clause, idx) => {
        const digitRuns = (clause.match(/\d[\d.\-]{5,}/g) || []).map((r) => digitsOf(r)).filter((d) => d.length >= 6);
        if (digitRuns.length > 0) personClauses.push({ idx, clause, digitRuns });
      });

      const clausesResult: { clause: string; found: boolean; excerpt: string }[] = clauseLines.map((c) => ({ clause: c, found: false, excerpt: '' }));

      // 1) Personas: matchear por DNI base (y nombre como respaldo)
      for (const pc of personClauses) {
        let found = false;
        let excerpt = '';
        for (const dr of pc.digitRuns) {
          const base = (dniToBase(dr) as string) || dr;
          if (base && [...insuredDniBases].some((b) => b.includes(base) || base.includes(b))) {
            found = true;
            excerpt = `Presente en la nómina (DNI ${base})`;
            break;
          }
        }
        if (!found) {
          const cn = normName(pc.clause);
          if (cn) {
            for (const nm of insuredNameSet) {
              if (nm && (nm.includes(cn) || cn.includes(nm) || tokenOverlap(cn, nm) >= 0.8)) {
                found = true;
                excerpt = `Nombre presente en la nómina: ${nm}`;
                break;
              }
            }
          }
        }
        clausesResult[pc.idx] = { clause: pc.clause, found, excerpt };
      }

      // 2) Fallback LLM (una sola llamada) para TODAS las cláusulas no
      // encontradas deterministamente (personas cuyos CUIT/DNI el OCR omitió
      // en la nómina estructurada, y cláusulas de texto legal). El LLM lee el
      // archivo y verifica presencia literal del CUIT/DNI o del significado.
      const missingIdx: number[] = [];
      clausesResult.forEach((c, i) => { if (!c.found) missingIdx.push(i); });
      if (missingIdx.length > 0) {
        try {
          const mcList = missingIdx.map((i) => clausesResult[i].clause);
          const clauseResult: any = await base44.integrations.Core.InvokeLLM({
            prompt: `Sos un validador estricto de pólizas de seguro. Para CADA ítem de la lista, verificá si está presente en el documento adjunto.\n- Si el ítem contiene un CUIT/CUIL/DNI, marcá found=true SOLO si ese número aparece literalmente en el documento (con o sin guiones/puntos), aunque el nombre no coincida.\n- Si el ítem es texto legal (sin número), marcá found=true solo si hay una frase que exprese claramente el mismo significado.\n- En excerpt copiá el número o frase que justifica, o una pista de dónde aparece.\n\nÍtems a verificar:\n${mcList.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
            file_urls: [doc.file_url],
            response_json_schema: {
              type: 'object',
              properties: {
                clauses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      clause: { type: 'string' },
                      found: { type: 'boolean' },
                      excerpt: { type: 'string' }
                    },
                    required: ['clause', 'found']
                  }
                },
                all_found: { type: 'boolean' }
              },
              required: ['clauses', 'all_found']
            }
          });
          const rc: any[] = Array.isArray(clauseResult?.clauses) ? clauseResult.clauses : [];
          missingIdx.forEach((mi, i) => {
            const m = rc[i];
            if (m && m.found) {
              clausesResult[mi] = { clause: clausesResult[mi].clause, found: true, excerpt: (m.excerpt || 'Encontrado en el documento') };
            }
          });
        } catch (e) {
          // Si el fallback falla, se mantiene el resultado determinista.
        }
      }

      const allFound = clausesResult.every((c) => c.found);
      clauseValidation = { clauses: clausesResult, all_found: allFound };
    }

    const nonRepetitionOk = nonRepetitionClauses.length === 0 || (clauseValidation?.all_found === true);

    const requiredAmount = event?.insurance_insured_amount || 0;
    const docAmount = extracted.coverage_amount || 0;
    // ART no lleva monto de cobertura — se omite la validación de monto para ART
    const amountOk = detectedKind === 'ART' ? true : (!requiredAmount || docAmount >= requiredAmount);

    const insuranceIssues = [];
    if (nonRepetitionClauses.length > 0 && !nonRepetitionOk) {
      const missing = (clauseValidation?.clauses || []).filter(c => !c.found).map(c => c.clause);
      insuranceIssues.push(`Faltan ${missing.length} cláusula(s) de no repetición en la póliza`);
    }
    if (detectedKind !== 'ART' && requiredAmount && docAmount < requiredAmount) {
      insuranceIssues.push(`El monto asegurado ($${docAmount.toLocaleString('es-AR')}) es menor al mínimo requerido ($${requiredAmount.toLocaleString('es-AR')})`);
    }
    if (requiredKind && !kindMatch) {
      insuranceIssues.push(`El tipo de seguro detectado (${detectedKind}) no coincide con el requerido para la empresa (${requiredKind})`);
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

    // Overall validity — la nómina parcial NO bloquea la aprobación: se aprueba
    // el seguro para los empleados que figuran en la nómina y los que no figuran
    // quedan como "sin seguro" (el flujo de acreditación ya les impide
    // acreditarse sin seguro aprobado). Sólo bloquean fechas, cláusulas, monto y tipo.
    const isCompanyLevelDoc = !doc.person_id && !!doc.company;
    const overallValid = isCompanyLevelDoc
      ? dateValid && (!eventCoverage || eventCoverage.covers_event) && nonRepetitionOk && amountOk && kindMatch
      : dniMatch && dateValid && (!eventCoverage || eventCoverage.covers_event) && nonRepetitionOk && amountOk && kindMatch;

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
        coverage_type: extracted.coverage_type || '',
        insurance_kind: detectedKind
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
        detected_kind: detectedKind,
        required_kind: requiredKind,
        kind_match: kindMatch,
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