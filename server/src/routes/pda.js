import { Router } from 'express';
import { prisma } from '../db/prisma.js';

export const pdaRouter = Router();

// Heartbeat: la PDA reporta su número, batería y modo. Crea/actualiza la
// estación y sincroniza los logs de acceso offline pendientes.
pdaRouter.post('/heartbeat', async (req, res, next) => {
  try {
    const { station_number, battery_level, mode, event_id } = req.body;
    let station = await prisma.pdaStation.findUnique({ where: { station_number } });
    if (station) {
      station = await prisma.pdaStation.update({
        where: { id: station.id },
        data: { last_seen: new Date(), battery_level, mode, event_id: event_id || station.event_id },
      });
    } else {
      station = await prisma.pdaStation.create({
        data: {
          station_number,
          battery_level,
          mode,
          event_id,
          operator_name: req.user?.full_name || req.user?.email,
          company: req.user?.data?.company,
          last_seen: new Date(),
          created_by_id: req.user?.id,
        },
      });
    }
    res.json({ ok: true, station });
  } catch (e) { next(e); }
});

// Encolar logs de acceso offline (la PDA los envía al volver a la LAN).
pdaRouter.post('/sync-logs', async (req, res, next) => {
  try {
    const { logs = [] } = req.body;
    let created = 0;
    for (const log of logs) {
      try {
        await prisma.accessLog.create({ data: { ...log, created_at: log.created_at ? new Date(log.created_at) : new Date() } });
        created++;
      } catch {}
    }
    res.json({ ok: true, created });
  } catch (e) { next(e); }
});

// Datos del evento para caché offline de la PDA (acreditaciones + vehículos).
pdaRouter.get('/event-data/:eventId', async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    const accreditations = await prisma.accreditation.findMany({
      where: { event_id: event.id, status: 'active' },
      select: { id: true, badge_code: true, person_name: true, person_id: true, access_level: true, event_phases: true, has_biometric: true, status: true, company: true, person_email: true },
    });
    const vehicles = await prisma.vehicle.findMany({
      where: { event_ids: { has: event.id }, status: { in: ['approved', 'pending'] } },
      select: { id: true, plate: true, person_name: true, brand: true, model: true, parking_sector: true, status: true, vehicle_type: true, color: true, event_ids: true },
    });
    res.json({ event, accreditations, vehicles });
  } catch (e) { next(e); }
});