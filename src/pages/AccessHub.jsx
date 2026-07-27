import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Hand, ScanFace, QrCode, Car, ArrowRight } from 'lucide-react';

const STATIONS = [
  {
    key: 'manual',
    label: 'Control Manual',
    description: 'Ingresá el código de credencial manualmente para validar el acceso.',
    icon: Hand,
    to: '/control-manual',
    accent: 'bg-sky-50 text-sky-600 ring-sky-200',
    btn: 'bg-sky-600 hover:bg-sky-700',
  },
  {
    key: 'person',
    label: 'Control de Personas Facial',
    description: 'Identificación facial de personas acreditadas en el evento.',
    icon: ScanFace,
    to: '/control-acceso',
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    key: 'person-qr',
    label: 'Control de Personas QR',
    description: 'Validación por QR de credenciales de personas acreditadas.',
    icon: QrCode,
    to: '/control-qr?mode=person',
    accent: 'bg-teal-50 text-teal-600 ring-teal-200',
    btn: 'bg-teal-600 hover:bg-teal-700',
  },
  {
    key: 'vehicle',
    label: 'Control Vehicular',
    description: 'Validación por QR de credenciales vehiculares y sectores de estacionamiento.',
    icon: Car,
    to: '/control-qr?mode=vehicle',
    accent: 'bg-amber-50 text-amber-600 ring-amber-200',
    btn: 'bg-amber-600 hover:bg-amber-700',
  },
];

export default function AccessHub() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Control de acceso</h1>
        <p className="mt-1 text-sm text-slate-500">Elegí el tipo de control para iniciar la estación de validación.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STATIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.to)}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className={`mb-4 grid h-14 w-14 place-items-center rounded-xl ring-1 ring-inset ${s.accent}`}>
                <Icon className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{s.label}</h2>
              <p className="mt-1 flex-1 text-sm text-slate-500">{s.description}</p>
              <span className={`mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white transition ${s.btn}`}>
                Abrir estación
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}