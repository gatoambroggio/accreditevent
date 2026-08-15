// Sirve a la PDA las acreditaciones y vehículos del evento (para caché offline).
// Igual al getEventAccessData de Base44 pero contra la Postgres local.

import { prisma } from '../db/prisma.js';

export async function getEventAccessData({ event_id }, { prisma: p = prisma } = {}) {
  if (!event_id) return { error: 'event_id requerido' };
  const event = await p.event.findUnique({ where: { id: event_id } });
  if (!event) return { error: 'Evento no encontrado' };

  const accreditations = await p.accreditation.findMany({
    where: { event_id, status: 'active' },
    select: {
      id: true, badge_code: true, person_name: true, person_id: true,
      access_level: true, event_phases: true, has_biometric: true,
      status: true, company: true, person_email: true, area: true,
    },
  });
  const vehicles = await p.vehicle.findMany({
    where: { event_ids: { has: event_id }, status: { in: ['approved', 'pending'] } },
    select: {
      id: true, plate: true, person_name: true, brand: true, model: true,
      parking_sector: true, status: true, vehicle_type: true, color: true, event_ids: true,
    },
  });
  return { event, accreditations, vehicles };
}