import React from 'react';
import { Link } from 'react-router-dom';
import AccessControl from '@/pages/AccessControl';

export default function AccessStation() {
  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Estación de control</span>
          </div>
          <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            ← Volver al panel
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <AccessControl standalone />
      </div>
    </div>
  );
}