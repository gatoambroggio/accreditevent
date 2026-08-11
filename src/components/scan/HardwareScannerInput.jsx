import React, { useState, useRef, useEffect } from 'react';
import { ScanLine } from 'lucide-react';

// Input para lectores físicos (PDA Zebra en modo "keyboard wedge" / DataWedge
// Keyboard Emulation). El lector escribe el código muy rápido y (según config)
// puede o no enviar Enter. Por eso auto-envía al detectar que dejaron de llegar
// caracteres (debounce), además de responder a Enter. No muestra teclado virtual
// (inputMode="none") — pensado para uso con el lector láser, no para tipear.
export default function HardwareScannerInput({
  onScan,
  disabled = false,
  placeholder = 'Apretá el gatillo del lector…',
  debounceMs = 250,
}) {
  const [value, setValue] = useState('');
  const ref = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fire = (code) => {
    if (!code || disabled) return;
    setValue('');
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    onScan(code);
    setTimeout(() => ref.current?.focus(), 0);
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const code = v.trim();
      if (code) fire(code);
    }, debounceMs);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = value.trim();
      if (code) fire(code);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-4 ring-emerald-500/10">
        <ScanLine className="h-7 w-7" />
      </div>
      <p className="mt-4 text-base font-bold text-slate-900">Listo para escanear</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Apretá el gatillo del lector de la PDA. La verificación es automática.
      </p>
      <input
        ref={ref}
        type="text"
        inputMode="none"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Código escaneado"
        className="mt-5 w-full max-w-sm rounded-lg border-2 border-emerald-300 bg-emerald-50/30 px-4 py-3 text-center text-lg font-mono tracking-wider text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20"
      />
    </div>
  );
}