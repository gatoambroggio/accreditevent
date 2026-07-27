import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Link2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function ShareLinkModal({ event, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!event) return null;

  const link = `${window.location.origin}/registro/${event.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: 'Link copiado', description: 'Pegalo donde quieras compartirlo.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Link de registro</p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{event.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-slate-500">
            Compartí este link con las personas que querés que se registren para el evento. Cada persona completará sus datos y cargará su foto.
          </p>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <code className="flex-1 truncate text-xs text-slate-700">{link}</code>
            <button
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                copied ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            <ExternalLink className="h-4 w-4" /> Abrir link
          </a>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}