import React, { useState, useEffect } from 'react';
import { X, Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useDocumentTypes } from '@/lib/useDocumentTypes';
import { logAudit } from '@/lib/audit';

export default function PersonDocUploadModal({ person, onClose, onUploaded }) {
  const { docTypes } = useDocumentTypes();
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (person) {
      setDocType('');
      setFile(null);
      setExpiresAt('');
      setError('');
      setSuccess(false);
    }
  }, [person]);

  if (!person) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !docType) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const payload = {
        person_id: person.id,
        person_name: person.full_name,
        company: person.company || '',
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
        await base44.functions.invoke('createDocument', payload);
      } else {
        await base44.entities.Document.create(payload);
      }
      await logAudit('admin-upload-doc', 'Document', person.id, `${person.full_name}: ${file.name}`);
      setSuccess(true);
      setTimeout(() => { onUploaded?.(); }, 1200);
    } catch (err) {
      setError(err.message || 'Error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Subir documentación</p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{person.full_name}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-sm font-semibold text-slate-800">Documento subido correctamente</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
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
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Archivo — PDF, JPG o PNG (máx. 10 MB)</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700"
              />
              {file && <p className="mt-1 text-xs text-slate-500">{file.name}</p>}
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={uploading || !file || !docType}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Subiendo…' : 'Subir documento'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}