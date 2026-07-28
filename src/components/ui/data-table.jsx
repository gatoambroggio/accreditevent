import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function DataTable({ loading, isEmpty, emptyIcon: EmptyIcon, emptyMessage = 'No hay registros.', children, tableClassName = '', skeletonCols = 5, skeletonRows = 6, error = '' }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-red-300" />
          <p className="mt-3 text-sm text-red-600">{error}</p>
        </div>
      ) : loading ? (
        <div className="overflow-x-auto">
          <table className={`w-full text-left ${tableClassName}`}>
            <tbody>
              {Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {Array.from({ length: skeletonCols }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 animate-pulse rounded bg-slate-200" style={{ width: `${50 + ((i + j) * 13) % 45}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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