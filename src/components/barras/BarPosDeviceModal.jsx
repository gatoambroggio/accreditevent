import React, { useState } from 'react';
import { X, Save } from 'lucide-react';

export default function BarPosDeviceModal({ device, onClose, onSave }) {
  const [d, setD] = useState({
    device_id: '',
    alias: '',
    status: 'active',
    ...(device || {}),
  });

  const submit = () => {
    if (!d.device_id?.trim()) return;
    if (!d.alias?.trim()) return;
    onSave({
      ...d,
      device_id: d.device_id.trim(),
      alias: d.alias.trim(),
      status: d.status || 'active',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-base font-bold text-slate-900">{device?.id ? 'Editar terminal' : 'Nueva terminal Point'}</h4>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Dato de Mercado Pago: lo ves en el panel de desarrolladores → Tu aplicación → Integración de Point → Dispositivos.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Device ID</label>
            <input
              value={d.device_id || ''}
              onChange={(e) => setD({ ...d, device_id: e.target.value })}
              placeholder="ANDROID-xxxxxxxx-xxxx-xxxx"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Alias (nombre visible)</label>
            <input
              value={d.alias || ''}
              onChange={(e) => setD({ ...d, alias: e.target.value })}
              placeholder="Caja 1 / Barra Principal"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Estado</label>
            <select
              value={d.status || 'active'}
              onChange={(e) => setD({ ...d, status: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={submit} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">
            <Save className="h-4 w-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}