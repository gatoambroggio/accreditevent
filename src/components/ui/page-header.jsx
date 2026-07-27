import React from 'react';

export default function PageHeader({ kicker, title, children }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">{kicker}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}