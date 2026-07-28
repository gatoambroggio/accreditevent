import React from 'react';
import { Link } from 'react-router-dom';
import { ScanFace, QrCode, Hand, Radio, DoorOpen } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';

const STATIONS = [
  {
    path: '/control-acceso',
    title: 'Reconocimiento facial',
    desc: 'Estación de acceso por cámara con matching biométrico en tiempo real.',
    icon: ScanFace,
    color: 'emerald',
  },
  {
    path: '/control-qr',
    title: 'Escáner QR — Personas',
    desc: 'Validación de credenciales mediante código QR de acreditación.',
    icon: QrCode,
    color: 'blue',
  },
  {
    path: '/control-vehicular',
    title: 'Escáner QR — Vehículos',
    desc: 'Control de acceso vehicular por patente o código QR.',
    icon: QrCode,
    color: 'violet',
  },
  {
    path: '/control-manual',
    title: 'Control manual',
    desc: 'Búsqueda y validación manual de personas por nombre o DNI.',
    icon: Hand,
    color: 'amber',
  },
  {
    path: '/access-monitor',
    title: 'Monitor en vivo',
    desc: 'Visualización en tiempo real de todos los intentos de acceso.',
    icon: Radio,
    color: 'rose',
  },
];

const COLOR_MAP = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  violet: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

export default function AccessHub() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Control de acceso" title="Estaciones de control">
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.path}
              to={s.path}
              className={`group rounded-xl border p-6 transition ${COLOR_MAP[s.color]}`}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/60">
                <Icon className="h-6 w-6" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
              <p className="mt-3 text-xs font-semibold opacity-70 group-hover:opacity-100">Abrir estación →</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}