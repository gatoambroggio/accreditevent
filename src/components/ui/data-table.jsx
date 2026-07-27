import React from 'react';
import { Loader2 } from 'lucide-react';

export default function DataTable({ loading, isEmpty, emptyIcon: EmptyIcon, emptyMessage = 'No hay registros.', children, tableClassName = '' }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {EmptyIcon && <EmptyIcon className="h-10 w-10 text-slate-300" />}
          <p className="mt-3 text-sm text-slate-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-left ${tableClassName}`}>{children}</table>
        </div>
      )}
    </div>
  );
}

export function Th({ children, className = '' }) {
  return <th className={`px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500 ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3.5 ${className}`}>{children}</td>;
}

export function Tr({ children }) {
  return <tr className="border-b border-slate-50 transition hover:bg-slate-50/50">{children}</tr>;
}