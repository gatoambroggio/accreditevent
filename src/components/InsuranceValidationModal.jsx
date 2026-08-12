import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Loader2, AlertTriangle, CheckCircle2, XCircle, FileText, Calendar, User, Building2, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { assignEventToCompanyEmployees } from '@/lib/assignEventToCompanyEmployees';
import { deriveInsuranceKind, INSURANCE_KIND_LABELS, formatInsuranceAmount } from '@/lib/insuranceKind';

export default function InsuranceValidationModal({ document: doc, onClose, onValidated }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Load available events and initialize selection:
  // 1) doc.event_id if present, 2) company's assigned (approved) event, 3) manual selection
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      try {
        const evs = await base44.entities.Event.list('-created_date', 100);
        if (cancelled) return;
        setEvents(evs);

        let initialEventId = doc.event_id || '';
        // If no event on the doc, look for the company's approved event assignment
        if (!initialEventId && doc.company) {
          try {
            const approvals = await base44.entities.EventCompanyApproval.filter(
              { provider_company: doc.company, status: 'approved' },
              '-created_date', 50
            );
            if (!cancelled && approvals.length > 0) {
              // Pick the first approved event that exists in our loaded events
              const match = approvals.find((a) => evs.some((e) => e.id === a.event_id));
              if (match) initialEventId = match.event_id;
            }
          } catch {}
        }
        if (!cancelled) setSelectedEventId(initialEventId);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [doc]);

  // Run validation when an event is selected
  useEffect(() => {
    if (!doc || !selectedEventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const res = await base44.functions.invoke('validateInsurance', { document_id: doc.id, event_id: selectedEventId });
        if (!cancelled) {
          if (res.data?.error) setError(res.data.error);
          else setResult(res.data);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error al validar el seguro');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [doc, selectedEventId]);

  if (!doc) return null;

  const handleAction = async (status, opts = {}) => {
    const partial = !!opts.partial;
    setActing(true);
    try {
      const me = await base44.auth.me();
      const role = me?.data?.role || me?.role || '';
      const empVal = result?.validation?.employee_validation;
      const customFields = { ...(doc.custom_fields || {}) };
      if (status === 'approved' && empVal && empVal.total_employees > 0) {
        if (empVal.has_insured_list) {
          customFields.has_insured_list = true;
          customFields.covered_person_ids = empVal.reconciliation
            .filter((e) => e.is_covered)
            .map((e) => e.person_id);
        } else {
          customFields.has_insured_list = false;
          customFields.covered_person_ids = [];
        }
      } else if (status === 'approved') {
        customFields.has_insured_list = false;
        customFields.covered_person_ids = [];
      }
      if (status === 'approved') customFields.partial_approval = partial;
      const reviewNote = status === 'approved'
        ? (partial
          ? 'Aprobación parcial: seguro aprobado manualmente con observaciones (cláusulas o personas no cubiertas). Los no cubiertos quedan SIN seguro.'
          : 'Seguro validado automáticamente (fechas, DNI y nómina de empleados verificados)')
        : 'Seguro rechazado: validación automática falló (DNI, fechas o nómina de empleados)';
      const expiresAt = result?.extracted?.valid_until || '';
      // Persistir tipo de seguro (ART / AP) y monto de cobertura extraído por OCR
      if (status === 'approved') {
        const kind = result?.extracted?.insurance_kind || deriveInsuranceKind(doc.document_type, result?.extracted?.coverage_type);
        customFields.insurance_kind = kind;
        customFields.coverage_amount = kind === 'ART' ? 0 : Number(result?.extracted?.coverage_amount || 0);
      }
      if (role === 'productora') {
        // Productora RLS blocks Document.update on provider-company docs — go via service role
        await base44.functions.invoke('reviewDocument', {
          document_id: doc.id,
          status,
          expires_at: expiresAt,
          review_note: reviewNote,
          custom_fields: customFields,
        });
      } else {
        await base44.entities.Document.update(doc.id, {
          status,
          review_note: reviewNote,
          reviewed_by: me?.full_name || me?.email || '',
          reviewed_at: new Date().toISOString(),
          ...(expiresAt ? { expires_at: expiresAt } : {}),
          custom_fields: customFields,
        });
      }

      // Auto-assign the event to all company employees when insurance is approved
      if (status === 'approved' && doc.company && selectedEventId) {
        try {
          const eventName = events.find((e) => e.id === selectedEventId)?.name || '';
          await assignEventToCompanyEmployees(doc.company, selectedEventId, eventName);
        } catch (assignErr) {
          console.error('Error al asignar evento a empleados:', assignErr);
        }
      }

      onValidated?.();
    } catch (e) {
      setError(e.message);
    }
    setActing(false);
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-AR') : '—';
  const fmtMoney = (n) => n ? '$' + Number(n).toLocaleString('es-AR') : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Validación de Seguro</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {!doc.event_id && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-amber-800">Evento a validar</span>
                <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  <option value="">Seleccionar evento…</option>
                  {events.map((ev) => (<option key={ev.id} value={ev.id}>{ev.name}</option>))}
                </select>
                <p className="mt-1.5 text-xs text-amber-700">El documento no está vinculado a un evento. Seleccioná contra qué evento validar las cláusulas de no repetición y el monto asegurado.</p>
              </label>
            </div>
          )}
          {!selectedEventId && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Seleccioná un evento para iniciar la validación del seguro.</p>
            </div>
          )}
          {selectedEventId && loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-3 text-sm text-slate-500">Analizando póliza con OCR…</p>
            </div>
          )}

          {selectedEventId && error && !loading && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-800">No se pudo validar</p>
                <p className="mt-0.5 text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {selectedEventId && result && !loading && (
            <div className="space-y-5">
              {/* Overall result */}
              <div className={`flex items-center gap-3 rounded-lg border p-4 ${result.valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                {result.valid ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-red-600" />}
                <div>
                  <p className={`text-sm font-bold ${result.valid ? 'text-emerald-800' : 'text-red-800'}`}>
                    {result.valid ? 'Póliza válida' : 'Póliza con observaciones'}
                  </p>
                  <p className={`text-xs ${result.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                    {result.valid ? 'DNI y fechas verificados correctamente' : 'Revisá los puntos marcados a continuación'}
                  </p>
                </div>
              </div>

              {/* Extracted data */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Datos extraídos de la póliza</p>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Titular" value={result.extracted.policyholder_name} />
                  <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="DNI titular" value={result.extracted.policyholder_dni + (result.extracted.policy_dni_was_cuit ? ` (DNI: ${result.extracted.policy_dni_base})` : '')} />
                  <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Nº póliza" value={result.extracted.policy_number} />
                  <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Aseguradora" value={result.extracted.insurance_company} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Vigencia desde" value={fmtDate(result.extracted.valid_from)} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Vigencia hasta" value={fmtDate(result.extracted.valid_until)} />
                  <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Tipo de cobertura" value={result.extracted.coverage_type} />
                  <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Monto de cobertura" value={result.extracted.insurance_kind === 'ART' ? 'No corresponde (ART)' : fmtMoney(result.validation.coverage_amount)} />
                  <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Tipo de seguro (OCR)" value={INSURANCE_KIND_LABELS[result.extracted.insurance_kind || deriveInsuranceKind(doc.document_type, result.extracted.coverage_type)] || '—'} />
                  {result.validation.required_kind && (
                    <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Tipo requerido (empresa)" value={INSURANCE_KIND_LABELS[result.validation.required_kind] || result.validation.required_kind} />
                  )}
                </div>
              </div>

              {/* Validation checks */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Validaciones</p>
                <div className="space-y-2">
                  <CheckRow label="Coincidencia de DNI" passed={result.validation.dni_match}
                    detail={`Persona: ${result.validation.person_dni || '—'} · Póliza: ${result.validation.policy_dni || '—'}${result.extracted.policy_dni_was_cuit ? ' (extraído de CUIT/CUIL)' : ''}`} />
                  {result.validation.required_kind && (
                    <CheckRow label="Tipo de seguro requerido por la empresa"
                      passed={result.validation.kind_match}
                      detail={result.validation.kind_match
                        ? `La póliza corresponde al tipo requerido (${INSURANCE_KIND_LABELS[result.validation.required_kind] || result.validation.required_kind})`
                        : `La póliza detectada (${INSURANCE_KIND_LABELS[result.validation.detected_kind] || result.validation.detected_kind}) no corresponde al requerido (${INSURANCE_KIND_LABELS[result.validation.required_kind] || result.validation.required_kind})`} />
                  )}
                  <CheckRow label="Vigencia de fechas" passed={result.validation.date_valid}
                    detail={result.validation.date_issues.length > 0 ? result.validation.date_issues.join(' · ') : 'Fechas válidas y vigentes'} />
                  {result.validation.insurance_config && result.validation.insurance_config.non_repetition_clauses?.length > 0 && (() => {
                    const cv = result.validation.insurance_config.clause_validation;
                    const found = (cv?.clauses || []).filter(c => c.found).length;
                    const total = (cv?.clauses || []).length;
                    return (
                      <CheckRow label={`Cláusulas de no repetición (${found}/${total} encontradas)`}
                        passed={result.validation.insurance_config.non_repetition_ok}
                        detail={result.validation.insurance_config.non_repetition_ok
                          ? 'Todas las cláusulas requeridas están presentes en la póliza'
                          : `Faltan ${total - found} cláusula(s)/persona(s) requeridas en la póliza`} />
                    );
                  })()}
                  {result.validation.insurance_config && result.validation.insurance_config.required_amount > 0 && result.extracted.insurance_kind !== 'ART' && (
                    <CheckRow label="Monto asegurado"
                      passed={result.validation.insurance_config.amount_ok}
                      detail={`Requerido: ${fmtMoney(result.validation.insurance_config.required_amount)} · Póliza: ${fmtMoney(result.validation.insurance_config.document_amount)}`} />
                  )}
                  {result.validation.employee_validation && result.validation.employee_validation.total_employees > 0 && (() => {
                    const ev = result.validation.employee_validation;
                    const allCovered = ev.all_covered;
                    return (
                      <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${allCovered ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                        <Users className={`mt-0.5 h-4 w-4 shrink-0 ${allCovered ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${allCovered ? 'text-emerald-800' : 'text-amber-800'}`}>
                            Nómina de empleados ({ev.covered_count}/{ev.total_employees} cubiertos)
                          </p>
                          <p className="text-xs text-slate-500">
                            {ev.uncovered_count > 0
                              ? `${ev.uncovered_count} empleado(s) no figuran en la póliza: al aprobar quedarán registrados pero SIN seguro (no se podrán acreditar hasta validarles el seguro).`
                              : 'Todos los empleados figuran en la nómina de la póliza.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {result.validation.insurance_config && result.validation.insurance_config.non_repetition_clauses?.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Cláusulas de no repetición requeridas
                  </p>
                  <div className="space-y-2">
                    {(result.validation.insurance_config.clause_validation?.clauses || result.validation.insurance_config.non_repetition_clauses.map(c => ({ clause: c, found: false, excerpt: '' }))).map((c, idx) => (
                      <div key={idx} className={`flex items-start gap-2.5 rounded-lg border p-3 ${c.found ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'}`}>
                        {c.found ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${c.found ? 'text-emerald-800' : 'text-red-800'}`}>
                            {c.found ? 'Presente' : 'No encontrada'}
                          </p>
                          <p className="text-xs text-slate-600 break-words">{c.clause}</p>
                          {c.excerpt && <p className="mt-1 text-xs text-slate-400 italic break-words">"{c.excerpt}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.validation.employee_validation && result.validation.employee_validation.total_employees > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Conciliación de nómina — {result.validation.employee_validation.company}
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <Users className="h-3 w-3" /> {result.validation.employee_validation.total_employees} empleados
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> {result.validation.employee_validation.covered_count} cubiertos
                    </span>
                    {result.validation.employee_validation.uncovered_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                        <XCircle className="h-3 w-3" /> {result.validation.employee_validation.uncovered_count} sin cobertura
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                      <FileText className="h-3 w-3" /> {result.validation.employee_validation.insured_in_policy} en póliza
                    </span>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b border-slate-100">
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Empleado</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">DNI</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Cobertura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.validation.employee_validation.reconciliation.map((emp) => (
                          <tr key={emp.person_id} className="border-b border-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{emp.full_name}</td>
                            <td className="px-3 py-2 text-slate-500">{emp.document || '—'}</td>
                            <td className="px-3 py-2">
                              {emp.is_covered ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" /> Cubierto
                                  {emp.match_method === 'name' && <span className="text-slate-400">(por nombre)</span>}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                                  <XCircle className="h-3 w-3" /> No cubierto
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {result && !loading && !error && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              Cerrar
            </button>
            <button onClick={() => handleAction('rejected')} disabled={acting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50">
              Rechazar
            </button>
            <button onClick={() => handleAction('approved', { partial: true })} disabled={acting}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-50">
              Aprobación parcial
            </button>
            <button onClick={() => handleAction('approved')} disabled={acting}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
              Aprobar seguro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value || '—'}</p>
    </div>
  );
}

function CheckRow({ label, passed, detail }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${passed ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'}`}>
      {passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
      <div>
        <p className={`text-sm font-semibold ${passed ? 'text-emerald-800' : 'text-red-800'}`}>{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}