export function getEventStatus(event) {
  const now = Date.now();
  const start = event.start_at ? new Date(event.start_at).getTime() : 0;
  const end = event.end_at ? new Date(event.end_at).getTime() : 0;
  const grace = (event.grace_hours ?? 4) * 3600000;
  const graceEnd = end + grace;

  if (start && now < start) return 'upcoming';
  if (end && now > graceEnd) return 'ended';
  if (end && now > end) return 'grace';
  return 'active';
}

export const EVENT_STATUS_INFO = {
  upcoming: { label: 'Próximo a iniciar', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'En curso', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  grace: { label: 'Período de gracia', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  ended: { label: 'Finalizado', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export function isWithinPhaseDates(phaseDates, date = new Date()) {
  if (!phaseDates || phaseDates.length === 0) return true;
  const today = date.toISOString().slice(0, 10);
  return phaseDates.some((p) => {
    if (!p.start_date && !p.end_date) return true;
    const start = p.start_date || p.end_date;
    const end = p.end_date || p.start_date;
    return today >= start && today <= end;
  });
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