import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { canAccess, getPolicy } from '../rls/engine.js';

export const accessRouter = Router();

// Estado del evento por fases (armado/show/desarme) según fechas.
function getEventStatus(event) {
  const now = Date.now();
  const a = event.armado_start ? new Date(event.armado_start).getTime() : null;
  const ae = event.armado_end ? new Date(event.armado_end).getTime() : null;
  const s = event.start_at ? new Date(event.start_at).getTime() : null;
  const e = event.end_at ? new Date(event.end_at).getTime() : null;
  const d = event.desarme_start ? new Date(event.desarme_start).getTime() : null;
  const de = event.desarme_end ? new Date(event.desarme_end).getTime() : null;
  if (de && now > de) return 'ended';
  if (e && now > e && (!de || now <= d)) return 'show_ended';
  if (d && now >= d && (!de || now <= de)) return 'desarme';
  if (s && e && now >= s && now <= e) return 'show';
  if (ae && a && now >= a && now <= ae) return 'armado';
  if (s && now < s) return 'upcoming';
  return 'draft';
}

// Fase actual según el día del show (show_days).
function currentPhase(event) {
  const st = getEventStatus(event);
  if (st === 'armado') return 'armado';
  if (st === 'desarme') return 'desarme';
  if (st === 'show' && event.start_at) {
    const dayIdx = Math.floor((Date.now() - new Date(event.start_at).getTime()) / 86400000);
    return dayIdx === 0 ? 'dia_evento' : `dia_${dayIdx}`;
  }
  return null;
}

// Valida acceso de persona.
function validatePerson(accred, event, zones) {
  if (!accred) return { ok: false, reason: 'not_found', message: 'Credencial no encontrada.' };
  if (accred.status === 'blocked' || accred.status === 'revoked') return { ok: false, reason: 'blocked', message: accred.block_reason || 'Acreditación bloqueada.' };
  // Zona: access_level contiene las zonas (coma). Si zones está vacío, permite.
  const allowedZones = (accred.access_level || 'general').split(',').map((z) => z.trim()).filter(Boolean);
  if (zones && zones.length > 0 && allowedZones.length > 0 && !allowedZones.some((z) => zones.includes(z))) {
    return { ok: false, reason: 'zone', message: `Zona no autorizada. Permite: ${allowedZones.join(', ')}.` };
  }
  // Fase: si el evento está en show y la acreditación tiene event_phases, la fase actual debe estar incluida.
  const phases = accred.event_phases || [];
  if (phases.length > 0) {
    const cp = currentPhase(event);
    if (cp && !phases.includes(cp) && !phases.includes('dia_evento')) {
      return { ok: false, reason: 'phase', message: `No autorizado para la fase ${cp}.` };
    }
  }
  return { ok: true };
}

// POST /api/access/validate  — valida por badge_code o patente.
accessRouter.post('/validate', async (req, res, next) => {
  try {
    const { event_id, badge_code, plate, zones = [], sectors = [], method = 'manual', pda_number, resource_type } = req.body;
    const event = await prisma.event.findUnique({ where: { id: event_id } });
    if (!event) return res.status(404).json({ ok: false, message: 'Evento no encontrado' });

    let accred = null, vehicle = null, type = 'person';
    if (badge_code) {
      accred = await prisma.accreditation.findFirst({ where: { badge_code, event_id } });
      if (!accred) {
        // ¿es vehículo por patente?
        vehicle = await prisma.vehicle.findFirst({ where: { plate: badge_code, event_ids: { has: event_id } } });
        if (vehicle) type = 'vehicle';
      }
    } else if (plate) {
      vehicle = await prisma.vehicle.findFirst({ where: { plate, event_ids: { has: event_id } } });
      type = 'vehicle';
    }

    if (type === 'person' && accred) {
      const r = validatePerson(accred, event, zones);
      await logAccess(req.user, event, accred, null, r, method, pda_number, 'person', zones, accred.access_level);
      return res.json({ ok: r.ok, type: 'person', person_name: accred.person_name, accred, message: r.message });
    }
    if (type === 'vehicle' && vehicle) {
      const r = validateVehicle(vehicle, event, sectors);
      await logAccess(req.user, event, null, vehicle, r, method, pda_number, 'vehicle', sectors, vehicle.parking_sector);
      return res.json({ ok: r.ok, type: 'vehicle', person_name: vehicle.person_name, vehicle, message: r.message });
    }
    await logAccess(req.user, event, null, null, { ok: false, reason: 'not_found' }, method, pda_number, resource_type || 'person', zones, '');
    res.json({ ok: false, type: 'unknown', message: 'Credencial no encontrada.' });
  } catch (e) { next(e); }
});

function validateVehicle(vehicle, event, sectors) {
  if (!vehicle) return { ok: false, reason: 'not_found', message: 'Vehículo no encontrado.' };
  if (vehicle.status === 'rejected') return { ok: false, reason: 'blocked', message: 'Vehículo rechazado.' };
  if (sectors && sectors.length > 0 && vehicle.parking_sector && !sectors.includes(vehicle.parking_sector)) {
    return { ok: false, reason: 'zone', message: `Sector no autorizado: ${vehicle.parking_sector}.` };
  }
  return { ok: true };
}

async function logAccess(user, event, accred, vehicle, r, method, pda_number, resource_type, zone, access_level) {
  const entry = {
    accreditation_id: accred?.id || vehicle?.id || 'unknown',
    person_name: accred?.person_name || vehicle?.person_name || 'Desconocido',
    badge_code: accred?.badge_code || vehicle?.plate || '',
    event_id: event.id,
    event_name: event.name,
    company: accred?.company || vehicle?.company || event.company,
    verified_by: user ? (user.full_name || user.email) : null,
    pda_number: pda_number || null,
    method,
    resource_type,
    zone: Array.isArray(zone) ? zone.join(', ') : zone || '',
    result: r.ok ? 'granted' : 'denied',
    denied_reason: r.ok ? '' : (r.reason || ''),
    access_level: access_level || '',
  };
  if (canAccess(getPolicy('AccessLog', 'create'), user || {}, entry)) {
    await prisma.accessLog.create({ data: entry });
  }
}