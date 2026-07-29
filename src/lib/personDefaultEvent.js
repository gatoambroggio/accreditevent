// Devuelve el evento asignado por defecto a una persona, priorizando event_id y luego event_ids.
// Solo devuelve eventos que existan en la lista de eventos disponibles.
export function pickPersonDefaultEvent(person, events) {
  if (!person || !Array.isArray(events) || events.length === 0) return '';
  const ids = new Set(events.map((e) => e.id));
  if (person.event_id && ids.has(person.event_id)) return person.event_id;
  if (Array.isArray(person.event_ids)) {
    const found = person.event_ids.find((id) => ids.has(id));
    if (found) return found;
  }
  return '';
}