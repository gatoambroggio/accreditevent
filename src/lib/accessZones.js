export const ZONES = [
  { value: 'general', label: 'General' },
  { value: 'backstage', label: 'Backstage' },
  { value: 'technical', label: 'Técnica' },
  { value: 'vip', label: 'VIP' },
];

const ZONE_ACCESS = {
  general: ['general', 'backstage', 'technical', 'vip', 'all-access'],
  backstage: ['backstage', 'all-access'],
  technical: ['technical', 'all-access'],
  vip: ['vip', 'all-access'],
};

export function canAccessZone(accessLevel, zone) {
  if (!zone || zone === 'general') return true;
  return ZONE_ACCESS[zone]?.includes(accessLevel) ?? false;
}