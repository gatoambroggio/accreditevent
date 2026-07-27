export const DEFAULT_ZONES = [
  { value: 'general', label: 'General' },
  { value: 'backstage', label: 'Backstage' },
  { value: 'technical', label: 'Técnica' },
  { value: 'vip', label: 'VIP' },
];

export function canAccessZone(accessLevel, zone) {
  if (!zone) return true;
  if (accessLevel === 'all-access') return true;
  return accessLevel === zone;
}

export function canAccessAnyZone(accessLevel, zones) {
  if (!zones || zones.length === 0) return true;
  return zones.some((zone) => canAccessZone(accessLevel, zone));
}