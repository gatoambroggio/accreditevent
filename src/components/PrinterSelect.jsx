import React from 'react';

// Combo de selección de impresora:
// - Si el agente local detectó impresoras, muestra un <select> poblado con ellas
//   (incluye el valor guardado aunque no esté en la lista detectada).
// - Si el agente está desconectado o no encontró impresoras, cae a un input de
//   texto plano para tipear el nombre manualmente.
export default function PrinterSelect({ label, value, onChange, printers, placeholder, hint }) {
  const hasPrinters = Array.isArray(printers) && printers.length > 0;
  // Garantiza que el valor guardado siempre sea seleccionable.
  const options = hasPrinters ? Array.from(new Set([...printers, value].filter(Boolean))) : [];

  const selectClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {hasPrinters ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          <option value="">— Seleccionar impresora —</option>
          {options.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={selectClass}
        />
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}