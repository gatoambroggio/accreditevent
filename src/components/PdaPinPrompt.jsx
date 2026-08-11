import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Lock, X } from 'lucide-react';

// Popup reutilizable para pedir la clave de administrador de la PDA antes de
// permitir cambios en la configuración (zonas/sectores o número de PDA).
// La clave se valida contra la estación asignada al dispositivo (admin_pin),
// o contra el valor por defecto "1234" si no hay estación / no tiene clave.
export default function PdaPinPrompt({ open, onClose, onSuccess, pdaNumber }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) { setPin(''); setError(''); }
  }, [open]);

  if (!open) return null;

  const confirm = async () => {
    setError('');
    setChecking(true);
    try {
      let correct = '1234';
      if (pdaNumber) {
        const mine = await base44.entities.PdaStation.filter({ station_number: pdaNumber }, '-created_date', 5);
        if (mine?.[0]?.admin_pin) correct = mine[0].admin_pin;
      }
      if (pin.trim() !== correct) {
        setError('Clave incorrecta.');
        setChecking(false);
        return;
      }
      onSuccess();
    } catch {
      setError('No se pudo validar la clave. Reintentá.');
    }
    setChecking(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !checking && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Lock className="h-5 w-5 text-emerald-600" /> Clave de administrador</h3>
          <button onClick={() => !checking && onClose()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">Ingresá la clave definida en Estaciones PDA para modificar la configuración de esta PDA.</p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pin.trim()) confirm(); }}
          autoFocus
          placeholder="Clave"
          style={{ textTransform: 'none' }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-bold tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={checking} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={confirm} disabled={checking || !pin.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}