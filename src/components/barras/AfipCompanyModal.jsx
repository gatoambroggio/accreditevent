import React, { useState } from 'react';
import { Loader2, Upload, FileCheck2, AlertCircle, ShieldCheck, Wifi, WifiOff, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function Field({ label, value, onChange, type = 'text', placeholder = '', hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

const MODO_OPTS = [
  { value: 'disabled', label: 'Desactivado', desc: 'Vende sin facturación AFIP (sin CAE, sin comprobante fiscal)' },
  { value: 'sandbox', label: 'Pruebas', desc: 'Comprobante no fiscal sin llamar a AFIP. Ideal para probar el POS.' },
  { value: 'production', label: 'Producción', desc: 'Emite CAE real en cada venta (o queda pendiente sin internet)' },
];

export default function AfipCompanyModal({ company, onClose, onSaved }) {
  const [afip, setAfip] = useState(company?.afip || {});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [uploadErr, setUploadErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const setField = (k, v) => setAfip((a) => ({ ...a, [k]: v }));

  const persist = async (data) => {
    const updated = await base44.entities.Company.update(company.id, { afip: data });
    return updated;
  };

  const uploadCert = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    setUploadErr('');
    try {
      const token = localStorage.getItem('ae_access_token');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/afip/${company.id}/cert`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo');
      setField(`${kind}_path`, data.path);
    } catch (e) {
      setUploadErr(kind === 'cert' ? 'No se pudo subir el certificado (requiere el servidor self-hosted).' : 'No se pudo subir la clave (requiere el servidor self-hosted).');
    } finally {
      setUploading(null);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await persist(afip);
      const token = localStorage.getItem('ae_access_token');
      const res = await fetch(`/api/afip/${company.id}/test`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setTestResult(await res.json());
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await persist(afip);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const modo = afip.modo || 'disabled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="allow-lowercase max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Facturación AFIP</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> {company.name}
            </h2>
            <p className="text-xs text-slate-500">Cada empresa emite sus propios comprobantes con su CUIT y certificado.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Modo */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODO_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setField('modo', o.value)}
              className={`rounded-xl border p-3 text-left transition ${modo === o.value ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <p className="text-sm font-bold text-slate-900">{o.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{o.desc}</p>
            </button>
          ))}
        </div>

        {modo !== 'disabled' && (
          <>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="CUIT del emisor" value={afip.cuit} onChange={(v) => setField('cuit', v.replace(/[^0-9]/g, ''))} placeholder="20111111112" hint="Sólo dígitos, sin guiones" />
              <Field label="Razón social" value={afip.razon_social} onChange={(v) => setField('razon_social', v)} placeholder="Mi Empresa S.R.L." />
              <Field label="Punto de venta" type="number" value={afip.pto_vta} onChange={(v) => setField('pto_vta', v ? Number(v) : '')} placeholder="1" />
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de comprobante</span>
                <select value={afip.tipo_cbte ?? 6} onChange={(e) => setField('tipo_cbte', Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                  <option value={6}>Factura B (consumidor final)</option>
                  <option value={11}>Factura C</option>
                  <option value={1}>Factura A (responsable inscripto)</option>
                </select>
              </label>
              <Field label="Condición IVA" value={afip.cond_iva} onChange={(v) => setField('cond_iva', v)} placeholder="responsable_inscripto" />
              <Field label="Alícuota IVA (%)" type="number" value={afip.alicuota_iva} onChange={(v) => setField('alicuota_iva', v ? Number(v) : 0)} placeholder="21" hint="0 para no discriminar IVA (Factura B CF)" />
              <div className="sm:col-span-2">
                <Field label="Token AfipSDK (opcional)" type="password" value={afip.access_token} onChange={(v) => setField('access_token', v)} placeholder="Token de app.afipsdk.com" hint="Opcional si usás certificado propio en disco" />
              </div>
            </div>

            {/* Certificado y clave */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {['cert', 'key'].map((kind) => (
                <div key={kind} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600">{kind === 'cert' ? 'Certificado (.pem/.crt)' : 'Clave privada (.pem/.key)'}</p>
                  {afip[`${kind}_path`] ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                      <FileCheck2 className="h-4 w-4" /> Cargado en disco
                      <button onClick={() => setField(`${kind}_path`, '')} className="ml-auto text-red-500 hover:underline">Quitar</button>
                    </div>
                  ) : (
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      {uploading === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Subir {kind === 'cert' ? 'certificado' : 'clave'}
                      <input type="file" accept=".pem,.crt,.key,.cer,.txt" className="hidden" onChange={(e) => uploadCert(kind, e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              ))}
            </div>
            {uploadErr && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {uploadErr}
              </div>
            )}
          </>
        )}

        {error && <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Guardar
          </button>
          {modo === 'production' && (
            <button onClick={testConnection} disabled={testing} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Probar conexión
            </button>
          )}
          {testResult && (
            testResult.ok ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Conexión OK</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600"><WifiOff className="h-3.5 w-3.5" /> {testResult.error}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}