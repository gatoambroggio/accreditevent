export const DEFAULT_ZONES = [
  { value: 'general', label: 'General' },
  { value: 'backstage', label: 'Backstage' },
  { value: 'technical', label: 'Técnica' },
  { value: 'vip', label: 'VIP' },
];

export function canAccessZone(accessLevel, zone) {
  if (!zone) return true;
  if (!accessLevel) return false;
  // access_level puede traer varias zonas separadas por coma (ej. "general,backstage")
  const levels = String(accessLevel).split(',').map((l) => l.trim()).filter(Boolean);
  if (levels.includes('all-access')) return true;
  return levels.includes(zone);
}

export function canAccessAnyZone(accessLevel, zones) {
  if (!zones || zones.length === 0) return true;
  return zones.some((zone) => canAccessZone(accessLevel, zone));
}