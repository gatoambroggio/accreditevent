import React from 'react';
import { Camera, ScanLine } from 'lucide-react';

export default function ScanModeToggle({ mode, onChange }) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition';
  const cls = (active) =>
    active
      ? `${base} bg-emerald-600 text-white shadow-sm`
      : `${base} bg-white text-slate-600 border border-slate-200 hover:bg-slate-50`;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
      <button type="button" onClick={() => onChange('camera')} className={cls(mode === 'camera')}>
        <Camera className="h-4 w-4" /> Cámara
      </button>
      <button type="button" onClick={() => onChange('scanner')} className={cls(mode === 'scanner')}>
        <ScanLine className="h-4 w-4" /> Escáner físico
      </button>
    </div>
  );
}