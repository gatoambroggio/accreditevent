// Construye las opciones de fases del evento según la cantidad de días de show configurada.
// Mantiene armado/desarme, agrega "Día del show" (genérico, todo el show) y días
// individuales (Día 1 .. Día N, hasta 6). "Día del show" y los días específicos son
// EXCLUYENTES entre sí: una persona se acredita para el show completo (Día del show)
// o para días puntuales, pero no para ambos a la vez. Armado y desarme son independientes.
export function buildPhaseOptions(showDays) {
  const n = Math.max(1, Math.min(6, Number(showDays) || 1));
  const days = [];
  for (let i = 1; i <= n; i++) {
    days.push({ value: `dia_${i}`, label: `Día ${i}` });
  }
  return [
    { value: 'armado', label: 'Armado' },
    { value: 'dia_evento', label: 'Día del show' },
    ...days,
    { value: 'desarme', label: 'Desarme' },
  ];
}

// Grupos de fases mutuamente excluyentes: si se selecciona un valor de un grupo,
// se quitan los valores del/los otro/s grupo/s. Armado y desarme no pertenecen a
// ningún grupo (son independientes).
export const PHASE_EXCLUSIVE_GROUPS = [
  ['dia_evento'],
  ['dia_1', 'dia_2', 'dia_3', 'dia_4', 'dia_5', 'dia_6'],
];

// Opciones de fases de montaje (armado/desarme), independientes de los días de show.
export const SETUP_PHASE_OPTIONS = [
  { value: 'armado', label: 'Armado' },
  { value: 'desarme', label: 'Desarme' },
];

// Construye las opciones de días de show (Día del show + Día 1..N).
export function buildShowDayOptions(showDays) {
  const n = Math.max(1, Math.min(6, Number(showDays) || 1));
  const days = [];
  for (let i = 1; i <= n; i++) {
    days.push({ value: `dia_${i}`, label: `Día ${i}` });
  }
  return [
    { value: 'dia_evento', label: 'Día del show' },
    ...days,
  ];
}

// Etiquetas legibles para cada fase/día (incluye valores legacy y día_1..día_6).
export const PHASE_LABELS = {
  armado: 'Armado',
  dia_evento: 'Día del show',
  desarme: 'Desarme',
  dia_1: 'Día 1',
  dia_2: 'Día 2',
  dia_3: 'Día 3',
  dia_4: 'Día 4',
  dia_5: 'Día 5',
  dia_6: 'Día 6',
};

export function phaseLabel(value) {
  return PHASE_LABELS[value] || value;
}

// Dado un evento y una lista de eventos, devuelve el show_days del evento seleccionado.
export function getShowDays(events, eventId) {
  const ev = events?.find((e) => e.id === eventId);
  return ev?.show_days || 1;
}