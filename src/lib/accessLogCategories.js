// Categorías de accesos para reportes y monitor en vivo.
// Mapea el campo denied_reason de AccessLog a etiquetas legibles y colores.
//
// Categorías (por PDA):
//   validados        -> result = granted
//   rechazados       -> denied_reason zone | phase  (persona/vehículo encontrado, sin acceso)
//   acceso incorrecto-> denied_reason not_found    (credencial no encontrada / código inválido)
//   cancelados        -> denied_reason blocked       (acreditación deshabilitada por el admin)

export const DENIED_REASON_LABELS = {
  zone: 'Rechazado',
  phase: 'Rechazado',
  not_found: 'Acceso incorrecto',
  blocked: 'Cancelado',
  '': 'Denegado',
};

export const DENIED_REASON_COLORS = {
  zone: 'bg-amber-50 text-amber-700 ring-amber-200',
  phase: 'bg-amber-50 text-amber-700 ring-amber-200',
  not_found: 'bg-slate-100 text-slate-600 ring-slate-200',
  blocked: 'bg-purple-50 text-purple-700 ring-purple-200',
  '': 'bg-red-50 text-red-700 ring-red-200',
};

export function deniedReasonLabel(reason) {
  return DENIED_REASON_LABELS[reason] || 'Denegado';
}

export function deniedReasonColor(reason) {
  return DENIED_REASON_COLORS[reason] || DENIED_REASON_COLORS[''];
}

// Clasifica un log en una de las 4 categorías del reporte por PDA.
export function accessCategory(log) {
  if (!log || log.result !== 'denied') return 'validados';
  const r = log.denied_reason || '';
  if (r === 'blocked') return 'cancelados';
  if (r === 'not_found') return 'acceso_incorrecto';
  if (r === 'zone' || r === 'phase') return 'rechazados';
  return 'rechazados';
}