export function getEventStatus(event) {
  const now = Date.now();
  const start = event.start_at ? new Date(event.start_at).getTime() : 0;
  const end = event.end_at ? new Date(event.end_at).getTime() : 0;

  if (start && now < start) return 'upcoming';
  if (end && now > end) return 'ended';
  return 'active';
}

export const EVENT_STATUS_INFO = {
  upcoming: { label: 'Próximo a iniciar', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'En curso', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  ended: { label: 'Finalizado', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export function isWithinEventPhases(event, eventPhases, date = new Date()) {
  if (!event) return true;
  const now = date.getTime();
  if (!eventPhases || eventPhases.length === 0) {
    const start = event.start_at ? new Date(event.start_at).getTime() : 0;
    const end = event.end_at ? new Date(event.end_at).getTime() : Infinity;
    return now >= start && now <= end;
  }
  const PHASE_DATES = {
    armado: ['armado_start', 'armado_end'],
    dia_evento: ['start_at', 'end_at'],
    desarme: ['desarme_start', 'desarme_end'],
  };
  return eventPhases.some((phase) => {
    const [startField, endField] = PHASE_DATES[phase] || [];
    const start = event[startField];
    const end = event[endField];
    if (!start || !end) return false;
    return now >= new Date(start).getTime() && now <= new Date(end).getTime();
  });
}

export function canModify(user) {
  const role = user?.role || user?.data?.role;
  return role !== 'operador';
}

export function speakResult(ok) {
  try {
    const u = new SpeechSynthesisUtterance(ok ? 'Aceptado' : 'Denegado');
    u.lang = 'es-AR';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}