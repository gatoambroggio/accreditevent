import React, { useState, useRef, useEffect } from 'react';
import { ScanLine, Check } from 'lucide-react';

// Input pensado para lectores físicos (PDA Zebra TC21/TC22/TC52/...) configurados
// como "keyboard wedge" (DataWedge en modo Keyboard Emulation): el lector escribe
// el código y termina con Enter. Funciona en todos los modelos de Zebra sin código
// específico de dispositivo.
export default function HardwareScannerInput({
  onScan,
  disabled = false,
  placeholder = 'Apretá el gatillo del lector o escribí el código…',
}) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const submit = () => {
    const code = value.trim();
    if (!code || disabled) return;
    setValue('');
    onScan(code);
    setTimeout(() => ref.current?.focus(), 0);
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10">
        <ScanLine className="h-7 w-7" />
      </div>
      <p className="mt-4 text-base font-bold text-slate-900">Listo para escanear</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Apretá el gatillo del lector de la PDA o escribí el código y presioná Enter.
      </p>
      <input
        ref={ref}
        type="text"
        inputMode="text"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="mt-5 w-full max-w-sm rounded-lg border-2 border-emerald-300 bg-emerald-50/30 px-4 py-3 text-center text-lg font-mono tracking-wider text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        <Check className="h-4 w-4" /> Verificar
      </button>
    </div>
  );
}