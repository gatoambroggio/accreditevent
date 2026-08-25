import React from 'react';
import { X } from 'lucide-react';
import Pdf417Scanner from '@/components/dni/Pdf417Scanner';

// Modal delgado que envuelve el lector PDF417 (cámara + imagen, con botón
// "Capturar y decodificar"). Reusa el mismo componente que ya funciona en la
// página DniScan. onScanned recibe el resultado parseado del PDF417.
export default function Pdf417ScannerModal({ open, onClose, onScanned }) {
  if (!open) return null;
  return (
    <div className="allow-lowercase fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Escaneo PDF417</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Escanear DNI por código de barras</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <Pdf417Scanner embedded onScanned={(result) => { onScanned(result); onClose(); }} />
        </div>
      </div>
    </div>
  );
}