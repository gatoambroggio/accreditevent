import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Loader2, AlertTriangle, CheckCircle2, XCircle, FileText, Calendar, User, Building2 } from 'lucide-react';
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
      await base44.entities.Document.update(doc.id, {
        status,
        review_note: status === 'approved'
          ? 'Seguro validado automáticamente (DNI y fechas verificadas)'
          : 'Seguro rechazado: validación automática falló',
        reviewed_by: me?.full_name || me?.email || '',
        reviewed_at: new Date().toISOString(),
        ...(result?.extracted?.valid_until ? { expires_at: result.extracted.valid_until } : {}),
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
                  <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="DNI titular" value={result.extracted.policyholder_dni} />
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
                    detail={`Persona: ${result.validation.person_dni || '—'} · Póliza: ${result.validation.policy_dni || '—'}`} />
                  <CheckRow label="Vigencia de fechas" passed={result.validation.date_valid}
                    detail={result.validation.date_issues.length > 0 ? result.validation.date_issues.join(' · ') : 'Fechas válidas y vigentes'} />
                  {result.validation.event_coverage && (
                    <CheckRow label={`Cobertura del evento: ${result.validation.event_coverage.event_name}`}
                      passed={result.validation.event_coverage.covers_event}
                      detail={`${fmtDate(result.validation.event_coverage.event_start)} → ${fmtDate(result.validation.event_coverage.event_end)}`} />
                  )}
                </div>
              </div>
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