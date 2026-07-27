import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Loader2, FileText, ExternalLink } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';

const DOC_LABELS = {
  dni: 'DNI',
  work_insurance: 'Seguro de trabajo',
  tax_certificate: 'Certificado fiscal',
  contract: 'Contrato',
  other: 'Otro',
};

export default function PersonDetailModal({ person, onClose }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!person) return;
    (async () => {
      try {
        const data = await base44.entities.Document.filter({ person_id: person.id }, '-created_date', 100);
        setDocs(data);
      } catch {}
      setLoading(false);
    })();
  }, [person]);

  if (!person) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">DOCUMENTACIÓN</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{person.full_name}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{person.document || 'Sin documento'} · {person.company || 'Sin empresa'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Esta persona no subió documentación.</p>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-slate-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{DOC_LABELS[doc.document_type] || doc.document_type}</p>
                    <p className="text-xs text-slate-400">{doc.original_name}</p>
                    {doc.review_note && <p className="mt-0.5 text-xs text-slate-500">Nota: {doc.review_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={doc.status} />
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50" title="Ver archivo">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}