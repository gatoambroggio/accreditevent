import React, { useState, useEffect } from 'react';
import { X, Loader2, Save } from 'lucide-react';

const MODULE_OPTIONS = [
  { value: '/', label: 'Resumen' },
  { value: '/accreditations', label: 'Acreditaciones' },
  { value: '/accreditation-facial', label: 'Acreditación facial' },
  { value: '/dni-scan', label: 'Escaneo de DNI' },
  { value: '/access-control', label: 'Control de acceso' },
  { value: '/emergency-scan', label: 'Escaneo de emergencia' },
  { value: '/access-monitor', label: 'Monitor en vivo' },
  { value: '/vehicles', label: 'Vehículos acreditados' },
  { value: '/parking-sectors', label: 'Sectores de estacionamiento' },
  { value: '/parking-capacities', label: 'Capacidades por evento' },
  { value: '/documents', label: 'Documentos' },
  { value: '/people', label: 'Personal de Empresas' },
  { value: '/personas-autonomas', label: 'Personas Autónomas' },
  { value: '/registered-people', label: 'Personas registradas' },
  { value: '/reports', label: 'Reportes' },
];

export default function OperatorModulesModal({ open, onClose, initialModules = [], onSave }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(initialModules || []);
      setError('');
    }
  }, [open, initialModules]);

  if (!open) return null;

  const toggle = (value) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(selected);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Configuración</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Módulos de operadores</h2>
            <p className="mt-1 text-sm text-slate-500">Definí qué módulos del menú verán todos los operadores de tu productora.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {MODULE_OPTIONS.map((o) => {
              const active = selected.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}