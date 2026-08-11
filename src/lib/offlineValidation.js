// Validación pura (sin red) de acreditaciones y vehículos para modo offline.
import { canAccessAnyZone } from '@/lib/accessZones';
import { isWithinEventPhases } from '@/lib/accessUtils';

export function validatePersonAccred(accred, event, selectedZones, zones) {
  if (!accred) return { ok: false, message: 'Credencial no válida para este evento.' };
  const zoneLabel = selectedZones.map((z) => zones.find((zz) => zz.value === z)?.label || z).join(', ');
  if (!canAccessAnyZone(accred.access_level, selectedZones)) {
    return { ok: false, message: `Acceso restringido para la zona: ${zoneLabel}.` };
  }
  if (!isWithinEventPhases(event, accred.event_phases)) {
    return { ok: false, message: 'Acceso fuera del rango de fechas autorizado.' };
  }
  return { ok: true };
}

export function validateVehicleObj(vehicle, event, selectedSectors, parkingSectors) {
  if (!vehicle) return { ok: false, message: 'Vehículo no registrado.' };
  const isAssigned = (vehicle.event_ids || []).includes(event.id);
  if (!isAssigned) return { ok: false, message: 'Vehículo no asignado a este evento.' };
  if (vehicle.status !== 'approved') {
    return { ok: false, message: 'Vehículo no autorizado. El estado no es aprobado.' };
  }
  const sectorLabel = parkingSectors.find((s) => s.value === vehicle.parking_sector)?.label || vehicle.parking_sector || 'Sin sector';
  if (selectedSectors.length > 0 && vehicle.parking_sector && !selectedSectors.includes(vehicle.parking_sector)) {
    return { ok: false, message: `Sector de estacionamiento no permitido: ${sectorLabel}.`, sectorLabel };
  }
  return { ok: true, sectorLabel };
}