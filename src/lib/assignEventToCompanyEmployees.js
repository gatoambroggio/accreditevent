import { base44 } from '@/api/base44Client';

/**
 * Assigns an event to all employees of a provider company.
 * Updates each Person's event_ids, event_names, and event_id (if not already set).
 * @param {string} companyName - Provider company name (matches Person.company)
 * @param {string} eventId - Event ID to assign
 * @param {string} eventName - Event name (denormalized)
 * @returns {Promise<{updated: number}>}
 */
export async function assignEventToCompanyEmployees(companyName, eventId, eventName) {
  if (!companyName || !eventId) return { updated: 0 };

  const employees = await base44.entities.Person.filter(
    { company: companyName },
    '-created_date',
    500
  );

  const toUpdate = employees
    .filter((emp) => !(emp.event_ids || []).includes(eventId))
    .map((emp) => ({
      id: emp.id,
      event_ids: [...(emp.event_ids || []), eventId],
      event_names: [...(emp.event_names || []), eventName].filter((v, i, a) => a.indexOf(v) === i),
      event_id: emp.event_id || eventId,
    }));

  if (toUpdate.length > 0) {
    await base44.entities.Person.bulkUpdate(toUpdate);
  }

  return { updated: toUpdate.length };
}