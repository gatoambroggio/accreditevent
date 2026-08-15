import React, { useState, useEffect } from 'react';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

// Selector de impresora: si el backend local expone /api/print/printers (CUPS),
// muestra un dropdown con las impresoras disponibles. Si no (modo cloud o sin
// CUPS), muestra un input de texto para escribir el nombre manualmente.
export default function PrinterSelect({ label, value, onChange, hint }) {
  const [printers, setPrinters] = useState(null); // null = cargando, [] = none/error
  const [useText, setUseText] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('ae_access_token');
        const res = await fetch(`${API_BASE}/print/printers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setPrinters(data.printers || []);
        } else {
          setPrinters([]);
        }
      } catch {
        setPrinters([]);
      }
    })();
  }, []);

  const hasPrinters = printers && printers.length > 0;

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {hasPrinters && !useText ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">— Ninguna —</option>
          {printers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre de la impresora CUPS"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {hasPrinters && (
        <button type="button" onClick={() => setUseText(!useText)} className="mt-1 text-xs text-emerald-600 hover:underline">
          {useText ? '↩ Usar lista de impresoras' : '✎ Escribir manualmente'}
        </button>
      )}
    </label>
  );
}