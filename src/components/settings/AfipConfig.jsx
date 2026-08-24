import React, { useState } from 'react';
import { Loader2, Save, Upload, FileCheck2, AlertCircle, ShieldCheck, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';

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

const GUIDE = [
  { t: 'Inscribirse en AFIP', d: 'Dado de alta como responsable inscripto (o monotributo) con tu CUIT. Necesitás clave fiscal nivel 2+.' },
  { t: 'Generar el certificado digital', d: 'Con clave fiscal entrá a "Administrador de Claves" → crear clave y generar un par de claves. Descargá el certificado (.crt) y la clave privada (.key).' },
  { t: 'Autorizar el webservice', d: 'En AFIP → "Administrador de Relaciones" → agregar servicio → "Facturación Electrónica" (wsfev1) y "Autenticación" (wsaa). Asocialos al certificado creado.' },
  { t: 'Crear el punto de venta electrónico', d: 'En "Comprobantes en línea" → "Puntos de venta" → nuevo punto de venta del tipo "Electrónico". Anotá el número (ej. 1).' },
  { t: 'Subir cert y key acá abajo', d: 'El servidor guarda los archivos en un directorio privado (no en la base). Subí el .crt como "cert" y el .key como "key".' },
  { t: 'Probar conexión', d: 'Con el botón "Probar conexión" verificá que el servidor llega a AFIP y el certificado es válido.' },
];

export default function AfipConfig({ settings, update }) {
  const afip = settings.afip || {};
  const [showGuide, setShowGuide] = useState(false);
  const [uploading, setUploading] = useState(null); // 'cert' | 'key' | null
  const [uploadErr, setUploadErr] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const setField = (k, v) => update('afip', { ...(afip), [k]: v });

  const uploadCert = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    setUploadErr('');
    try {
      const token = localStorage.getItem('ae_access_token');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/afip/cert', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo');
      setField(`${kind}_path`, data.path);
    } catch (e) {
      setUploadErr(kind === 'cert' ? 'No se pudo subir el certificado. La subida sólo funciona en el servidor self-hosted.' : 'No se pudo subir la clave. La subida sólo funciona en el servidor self-hosted.');
    } finally {
      setUploading(null);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('ae_access_token');
      const res = await fetch('/api/afip/test', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: 'No se pudo probar la conexión (requiere el servidor self-hosted).' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Facturación AFIP</h2>
          <p className="mt-0.5 text-xs text-slate-500">Cada venta del POS emite un CAE en tiempo real si hay internet hacia afip.gob.ar. Sin conexión, la venta se entrega sin CAE y se factura en lote al reconectar.</p>
        </div>
        <button onClick={() => setShowGuide((s) => !s)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
          {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Guía de trámites
        </button>
      </div>

      {showGuide && (
        <ol className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-600 ring-1 ring-slate-100">
          {GUIDE.map((g, i) => (
            <li key={i} className="flex gap-2">
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{i + 1}</span>
              <span><b className="text-slate-800">{g.t}.</b> {g.d}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4">
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Habilitar facturación AFIP</p>
            <p className="text-xs text-slate-500">Emite CAE automáticamente en cada venta pagada del POS</p>
          </div>
          <input type="checkbox" checked={afip.enabled === true} onChange={(e) => setField('enabled', e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="CUIT del emisor" value={afip.cuit} onChange={(v) => setField('cuit', v.replace(/[^0-9]/g, ''))} placeholder="20111111112" hint="Sólo dígitos, sin guiones" />
        <Field label="Razón social" value={afip.razon_social} onChange={(v) => setField('razon_social', v)} placeholder="Mi Empresa S.R.L." />
        <Field label="Punto de venta" type="number" value={afip.pto_vta} onChange={(v) => setField('pto_vta', v ? Number(v) : '')} placeholder="1" hint="Punto de venta electrónico habilitado en AFIP" />
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de comprobante</span>
          <select value={afip.tipo_cbte ?? 6} onChange={(e) => setField('tipo_cbte', Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
            <option value={6}>Factura B (consumidor final)</option>
            <option value={11}>Factura C</option>
            <option value={1}>Factura A (responsable inscripto)</option>
          </select>
        </label>
        <Field label="Condición IVA" value={afip.cond_iva} onChange={(v) => setField('cond_iva', v)} placeholder="responsable_inscripto" />
        <Field label="Alícuota IVA (%)" type="number" value={afip.alicuota_iva} onChange={(v) => setField('alicuota_iva', v ? Number(v) : 0)} placeholder="21" hint="Usá 0 para no discriminar IVA (Factura B a consumidor final)" />
        <div className="sm:col-span-2">
          <Field label="Token AfipSDK (opcional)" type="password" value={afip.access_token} onChange={(v) => setField('access_token', v)} placeholder="Token de app.afipsdk.com" hint="Opcional si usás certificado propio en disco. Conseguilo en app.afipsdk.com" />
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
            <p className="mt-1 break-all text-[10px] text-slate-400">{afip[`${kind}_path`] || '—'}</p>
          </div>
        ))}
      </div>
      {uploadErr && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {uploadErr}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={testConnection} disabled={testing} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Probar conexión
        </button>
        {testResult && (
          testResult.ok ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Conexión OK</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600"><WifiOff className="h-3.5 w-3.5" /> {testResult.error}</span>
          )
        )}
        <span className="text-xs text-slate-500">Guardá la configuración con el botón superior antes de probar tras cambiar credenciales.</span>
      </div>
    </div>
  );
}