// Utilities for per-event, per-sector parking capacity

export function getSectorCapacity(event, sectorValue) {
  const caps = event?.parking_capacities || {};
  const val = caps[sectorValue];
  return typeof val === 'number' ? val : 0;
}

export function computeSectorOccupancy(vehicles, eventId) {
  const occ = {};
  for (const v of vehicles) {
    if (!v.parking_sector) continue;
    if (v.status && v.status !== 'approved') continue;
    const evIds = Array.isArray(v.event_ids) ? v.event_ids : [];
    if (eventId && !evIds.includes(eventId)) continue;
    occ[v.parking_sector] = (occ[v.parking_sector] || 0) + 1;
  }
  return occ;
}

export function isSectorFull(event, sectorValue, occupancy) {
  const cap = getSectorCapacity(event, sectorValue);
  if (!cap) return false;
  const used = occupancy[sectorValue] || 0;
  return used >= cap;
}

export function sectorStatus(event, sectorValue, occupancy) {
  const cap = getSectorCapacity(event, sectorValue);
  const used = occupancy[sectorValue] || 0;
  if (!cap) return { cap: 0, used, full: false, label: 'Sin límite' };
  return { cap, used, full: used >= cap, label: `${used}/${cap}` };
}