import React, { useState, useEffect } from 'react';
import { X, Upload, Loader2, FileText, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { logAudit } from '@/lib/audit';
import StatusBadge from '@/components/StatusBadge';

export default function CompanyDocUploadModal({ company, onClose }) {
  const { docTypes } = useDocumentTypes();
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const loadDocs = async () => {
    try {
      const me = await base44.auth.me().catch(() => null);
      const role = me?.data?.role || me?.role || '';
      let docs;
      if (role === 'productora') {
        // RLS bloquea leer documentos de empresas proveedoras — usar service-role
        const res = await base44.functions.invoke('getProductoraDocuments', {});
        docs = (res?.data?.documents || []).filter((d) => d.company === company.name && !d.person_id);
      } else {
        docs = await base44.entities.Document.filter({ company: company.name }, '-created_date', 100);
        docs = docs.filter((d) => !d.person_id);
      }
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
    setLoadingDocs(false);
  };

  useEffect(() => {
    if (company) {
      setDocType('');
      setFile(null);
      setExpiresAt('');
      setError('');
      setLoadingDocs(true);
      loadDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  if (!company) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !docType) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const payload = {
        company: company.name,
        person_name: company.name,
        document_type: docType,
        original_name: file.name,
        file_url,
        mime_type: file.type,
        size: file.size,
        status: 'pending',
        expires_at: expiresAt || null,
      };
      const me = await base44.auth.me().catch(() => null);
      const role = me?.data?.role || me?.role || '';
      if (role === 'productora') {
        // RLS bloquea crear documentos de empresas proveedoras — usar service-role
        await base44.functions.invoke('createDocument', payload);
      } else {
        await base44.entities.Document.create(payload);
      }
      await logAudit('admin-upload-company-doc', 'Document', company.id, `${company.name}: ${file.name}`);
      setFile(null);
      setDocType('');
      setExpiresAt('');
      e.target.reset();
      loadDocs();
    } catch (err) {
      setError(err.message || 'Error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    await base44.entities.Document.delete(doc.id);
    loadDocs();
  };

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Documentación</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{company.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de documento</span>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} required className={inputCls}>
                  <option value="">Seleccionar…</option>
                  {docTypes.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Vencimiento (opcional)</span>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Archivo — PDF, JPG o PNG (máx. 10 MB)</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={uploading || !file || !docType}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Subiendo…' : 'Subir documento'}
            </button>
          </form>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Documentación de la empresa</p>
            {loadingDocs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : documents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No hay documentación cargada todavía.</p>
              </div>
            ) : (
              <div className="max-h-[280px] space-y-1.5 overflow-y-auto">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{d.original_name}</p>
                      <p className="text-xs text-slate-400">
                        {docTypes.find((t) => t.value === d.document_type)?.label || d.document_type}
                        {d.expires_at ? ` · vence ${d.expires_at}` : ''}
                      </p>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-2">
                      <StatusBadge status={d.status} />
                      <button onClick={() => handleDeleteDoc(d)} className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}