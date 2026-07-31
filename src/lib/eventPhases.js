// Construye las opciones de fases del evento según la cantidad de días de show configurada.
// Mantiene armado/desarme y agrega días individuales (día 1 .. día N, hasta 6).
export function buildPhaseOptions(showDays) {
  const n = Math.max(1, Math.min(6, Number(showDays) || 1));
  const days = [];
  for (let i = 1; i <= n; i++) {
    days.push({ value: `dia_${i}`, label: `Día ${i}` });
  }
  return [
    { value: 'armado', label: 'Armado' },
    ...days,
    { value: 'desarme', label: 'Desarme' },
  ];
}

// Etiquetas legibles para cada fase/día (incluye valores legacy y día_1..día_6).
export const PHASE_LABELS = {
  armado: 'Armado',
  dia_evento: 'Show',
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