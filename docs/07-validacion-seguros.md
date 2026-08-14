# 07 — Validación de seguros (OCR local + matching determinista)

Porte del backend function `validateInsurance` actual. Reemplaza `ExtractDataFromUploadedFile` (Base44) por **tesseract.js** local y el fallback LLM por **Ollama opcional** (solo si hay GPU en el servidor).

## Flujo

```
POST /documents/:id/validate-insurance?event_id=...
  1. Leer documento (file_url → path local en uploads/)
  2. OCR con tesseract.js → texto
  3. Extraer campos con regex/JSON parse (NO LLM para la estructura base)
  4. Validación determinista: DNI, fechas, cláusulas, monto, tipo
  5. Reconciliación de nómina vs empleados de la empresa
  6. Fallback LLM (Ollama) SOLO para cláusulas no encontradas deterministamente
  7. Resultado: valid + issues + reconciliation
```

## OCR con tesseract.js

```js
// lib/ocr.js
const { createWorker } = require('tesseract.js');

async function ocrDocument(filePath) {
  const worker = await createWorker('spa+eng'); // español + inglés
  const { data: { text } } = await worker.recognize(filePath);
  await worker.terminate();
  return text;
}
```

Para PDFs, convertir páginas a imagen primero con `pdf2pic` o `pdf-poppler`, luego OCR cada imagen.

## Extracción de campos (regex determinista, sin LLM)

```js
// lib/insuranceExtract.js
function extractInsuranceData(text) {
  const digits = (s) => (s || '').replace(/\D/g, '');
  const findAmount = (re) => {
    const m = text.match(re);
    return m ? Number(m[1].replace(/[.,]/g, '')) : 0;
  };
  return {
    policy_number: text.match(/p[oó]liza\s*n?ro?[:\s]*([0-9\-\/]{4,})/i)?.[1] || '',
    insurance_company: text.match(/([A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ\s]{5,})\s*(?:S\.?A\.?|ART)/)?.[1]?.trim() || '',
    coverage_amount: findAmount(/(?:suma|capital|monto)[^0-9]{0,20}([\d.,]+)/i),
    valid_from: parseDate(text.match(/vigencia\s*desde[:\s]*([\d\/\-]{6,})/i)?.[1]),
    valid_until: parseDate(text.match(/vigencia\s*hasta[:\s]*([\d\/\-]{6,})/i)?.[1]) ||
                parseDate(text.match(/vencim?ient?o[:\s]*([\d\/\-]{6,})/i)?.[1]),
    policyholder_dni: findFirstDNI(text),
    all_document_numbers: (text.match(/\d{2}-\d{8}-\d|\d{7,8}/g) || []),
    insured_employees: extractNomina(text), // líneas "Nombre ... CUIT/DNI"
  };
}
```

> **Nota:** el OCR real es ruidoso; el sistema actual delega la extracción estructurada al LLM de Base44 (`ExtractDataFromUploadedFile` con `json_schema`). Para igualar robustez sin nube, **usar Ollama** con un modelo local (ej. `llama3.2` o `qwen2.5`) y el mismo `json_schema` del PRD para el paso de extracción, y **reservar tesseract.js puro solo si no hay GPU**. Es decir: tesseract da el texto, Ollama lo estructura a JSON. Esto replica 1:1 la calidad actual.

## Ollama como extractor estructurado

```js
// lib/llm.js (Opcional — requiere GPU en el servidor)
async function extractWithLLM(text, schema) {
  const resp = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      prompt: `Extraé del siguiente texto de póliza y devolvé SOLO JSON con este esquema:\n${JSON.stringify(schema)}\n\nTexto:\n${text}`,
      format: schema, stream: false,
    }),
  });
  const { response } = await resp.json();
  return JSON.parse(response);
}
```

## Validación (idéntica al validateInsurance actual)

Replicar exactamente:

1. **Tipo de seguro** — `detectKind(doc.document_type, coverage_type)` → ART | AP
2. **kind match** — comparar con `ProviderCompany.insurance_kind`
3. **DNI** — `dniToBase()` maneja CUIT/CUIL (11 dígitos → quita 2 y 1)
4. **Fechas** — vencimiento vs hoy; vigencia futura; cobertura armado→desarme del evento
5. **Cláusulas de no repetición** — split multi-línea, match por DNI base + nombre (token overlap ≥ 0.8)
6. **Monto** — ART no lleva monto; AP exige ≥ `event.insurance_insured_amount`
7. **Reconciliación** — empleados de la empresa vs nómina extraída (DNI base o nombre)

```js
function dniToBase(s) {
  const d = s.replace(/\D/g, '');
  return d.length === 11 ? d.substring(2, 10) : d;
}

function validateClauses(clauseLines, insuredDniBases, insuredNameSet) {
  return clauseLines.map(clause => {
    const digitRuns = (clause.match(/\d[\d.\-]{5,}/g) || []).map(r => r.replace(/\D/g,'')).filter(d => d.length >= 6);
    let found = false, excerpt = '';
    for (const dr of digitRuns) {
      const base = dniToBase(dr);
      if (base && [...insuredDniBases].some(b => b.includes(base) || base.includes(b))) {
        found = true; excerpt = `Presente (DNI ${base})`; break;
      }
    }
    if (!found) {
      const cn = normName(clause);
      for (const nm of insuredNameSet) {
        if (nm && (nm.includes(cn) || cn.includes(nm) || tokenOverlap(cn, nm) >= 0.8)) {
          found = true; excerpt = `Nombre: ${nm}`; break;
        }
      }
    }
    return { clause, found, excerpt };
  });
}
```

## Aprobación parcial
`overallValid` no bloquea por nómina parcial — solo bloquean fechas, cláusulas, monto y tipo. La "Aprobación parcial" (botón actual) permite acreditar empleados que figuran en la nómina y dejar al resto sin seguro (la acreditación les exige seguro aprobado). Replicar: endpoint extra `POST /documents/:id/partial-approve` con `custom_fields.partial_coverage_ids = [ids]`.

## Fallback LLM para cláusulas no encontradas
Igual que hoy: para las cláusulas `found=false`, una sola llamada a Ollama con el **archivo** (imagen) adjunto si el modelo soporta visión, o con el texto OCR si no. Si el fallback falla, se mantiene el resultado determinista.