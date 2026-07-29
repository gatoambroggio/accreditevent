import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Loader2, AlertTriangle, CheckCircle2, XCircle, FileText, Calendar, User, Building2, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function InsuranceValidationModal({ document: doc, onClose, onValidated }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setResult(null);
      try {
        const res = await base44.functions.invoke('validateInsurance', { document_id: doc.id });
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
  }, [doc]);

  if (!doc) return null;

  const handleAction = async (status) => {
    setActing(true);
    try {
      const me = await base44.auth.me();
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
      await base44.entities.Document.update(doc.id, {
        status,
        review_note: status === 'approved'
          ? 'Seguro validado automáticamente (fechas, DNI y nómina de empleados verificados)'
          : 'Seguro rechazado: validación automática falló (DNI, fechas o nómina de empleados)',
        reviewed_by: me?.full_name || me?.email || '',
        reviewed_at: new Date().toISOString(),
        ...(result?.extracted?.valid_until ? { expires_at: result.extracted.valid_until } : {}),
        custom_fields: customFields,
      });
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
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-3 text-sm text-slate-500">Analizando póliza con OCR…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-800">No se pudo validar</p>
                <p className="mt-0.5 text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {result && !loading && (
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
                  <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Monto de cobertura" value={fmtMoney(result.validation.coverage_amount)} />
                </div>
              </div>

              {/* Validation checks */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Validaciones</p>
                <div className="space-y-2">
                  <CheckRow label="Coincidencia de DNI" passed={result.validation.dni_match}
                    detail={`Persona: ${result.validation.person_dni || '—'} · Póliza: ${result.validation.policy_dni || '—'}${result.extracted.policy_dni_was_cuit ? ' (extraído de CUIT/CUIL)' : ''}`} />
                  <CheckRow label="Vigencia de fechas" passed={result.validation.date_valid}
                    detail={result.validation.date_issues.length > 0 ? result.validation.date_issues.join(' · ') : 'Fechas válidas y vigentes'} />
                  {result.validation.insurance_config && result.validation.insurance_config.non_repetition_required && (
                    <CheckRow label="Cláusula de no repetición"
                      passed={result.validation.insurance_config.non_repetition_ok}
                      detail={result.validation.insurance_config.has_non_repetition_clause
                        ? 'La póliza contiene la cláusula de no repetición requerida'
                        : 'La póliza NO contiene la cláusula de no repetición requerida por el evento'} />
                  )}
                  {result.validation.insurance_config && result.validation.insurance_config.required_amount > 0 && (
                    <CheckRow label="Monto asegurado"
                      passed={result.validation.insurance_config.amount_ok}
                      detail={`Requerido: ${fmtMoney(result.validation.insurance_config.required_amount)} · Póliza: ${fmtMoney(result.validation.insurance_config.document_amount)}`} />
                  )}
                  {result.validation.employee_validation && result.validation.employee_validation.total_employees > 0 && (
                    <CheckRow
                      label={`Nómina de empleados (${result.validation.employee_validation.covered_count}/${result.validation.employee_validation.total_employees} cubiertos)`}
                      passed={result.validation.employee_validation.all_covered}
                      detail={result.validation.employee_validation.uncovered_count > 0
                        ? `${result.validation.employee_validation.uncovered_count} empleado(s) no aparecen en la póliza`
                        : 'Todos los empleados están en la nómina de la póliza'} />
                  )}
                </div>
              </div>

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