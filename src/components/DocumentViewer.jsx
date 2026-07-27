import React from 'react';
import { X, Download, FileText } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function DocumentViewer({ doc, onClose }) {
  if (!doc) return null;

  const isImage = doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(doc.original_name || doc.file_url);
  const isPdf = doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.original_name || doc.file_url);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <p className="truncate text-sm font-bold text-slate-900">{doc.original_name || 'Documento'}</p>
              {doc.person_name && <p className="truncate text-xs text-slate-400">{doc.person_name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={doc.file_url}
              download={doc.original_name}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Descargar
            </a>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          {isImage ? (
            <div className="flex items-center justify-center">
              <Image
                src={doc.file_url}
                alt={doc.original_name}
                className="max-h-[70vh] w-auto rounded-lg object-contain shadow-md"
                fittingType="fit"
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={doc.file_url}
              title={doc.original_name}
              className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No se puede previsualizar este archivo.</p>
              <a
                href={doc.file_url}
                download={doc.original_name}
                onClick={(e) => e.stopPropagation()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <Download className="h-4 w-4" /> Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}