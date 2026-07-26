import React from 'react';

const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  draft: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blocked: 'bg-red-50 text-red-700 ring-red-200',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
  revoked: 'bg-red-50 text-red-700 ring-red-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  expired: 'bg-red-50 text-red-700 ring-red-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const LABELS = {
  draft: 'borrador',
  active: 'activo',
  closed: 'cerrado',
  pending: 'pendiente',
  approved: 'aprobado',
  blocked: 'bloqueado',
  revoked: 'revocado',
  rejected: 'rechazado',
  expired: 'vencido',
  inactive: 'inactivo',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-200';
  const label = LABELS[status] || status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}