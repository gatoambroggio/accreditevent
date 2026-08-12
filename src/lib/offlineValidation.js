// Validación pura (sin red) de acreditaciones y vehículos para modo offline.
// Devuelve { ok, reason, message } donde reason clasifica el motivo de
// denegación para reportes/monitor: 'zone' | 'phase' | 'not_found' | 'blocked'.
import { canAccessAnyZone } from '@/lib/accessZones';
import { isWithinEventPhases } from '@/lib/accessUtils';

export function validatePersonAccred(accred, event, selectedZones, zones) {
  if (!accred) return { ok: false, reason: 'not_found', message: 'Credencial no válida para este evento.' };
  // Acreditación cancelada / deshabilitada por el administrador
  if (accred.status === 'blocked' || accred.status === 'revoked') {
    return { ok: false, reason: 'blocked', message: 'Acreditación cancelada. El acceso fue deshabilitado.' };
  }
  const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');
  if (!canAccessAnyZone(accred.access_level, selectedZones)) {
    return { ok: false, reason: 'zone', message: `Acceso restringido para la zona: ${zoneLabel}.` };
  }
  if (!isWithinEventPhases(event, accred.event_phases)) {
    return { ok: false, reason: 'phase', message: 'Acceso fuera del rango de fechas autorizado.' };
  }
  return { ok: true, reason: 'granted' };
}

export function validateVehicleObj(vehicle, event, selectedSectors, parkingSectors) {
  if (!vehicle) return { ok: false, reason: 'not_found', message: 'Vehículo no registrado.' };
  const isAssigned = (vehicle.event_ids || []).includes(event.id);
  if (!isAssigned) return { ok: false, reason: 'not_found', message: 'Vehículo no asignado a este evento.' };
  if (vehicle.status === 'rejected') {
    return { ok: false, reason: 'blocked', message: 'Vehículo rechazado.' };
  }
  if (vehicle.status !== 'approved') {
    return { ok: false, reason: 'blocked', message: 'Vehículo no autorizado. El estado no es aprobado.' };
  }
  const sectorLabel = parkingSectors.find((s) => s.value === vehicle.parking_sector)?.label || vehicle.parking_sector || 'Sin sector';
  if (selectedSectors.length > 0 && vehicle.parking_sector && !selectedSectors.includes(vehicle.parking_sector)) {
    return { ok: false, reason: 'zone', message: `Sector de estacionamiento no permitido: ${sectorLabel}.`, sectorLabel };
  }
  return { ok: true, reason: 'granted', sectorLabel };
}