// Devuelve la empresa del usuario autenticado, buscando en ambas ubicaciones posibles
export function getUserCompany(user) {
  return user?.company || user?.data?.company || '';
}

// Devuelve los event_ids asignados al usuario
export function getUserEventIds(user) {
  return user?.assigned_event_ids || user?.data?.assigned_event_ids || [];
}

// Filtra vehículos por empresa del usuario productora
export function filterVehiclesByCompany(vehicles, user) {
  const company = getUserCompany(user);
  if (user?.role !== 'productora') return vehicles;
  if (!company) return [];
  return vehicles.filter((v) => v.company === company);
}

// Filtra registros (access logs, etc.) por empresa del usuario productora
export function filterLogsByCompany(logs, user) {
  const company = getUserCompany(user);
  if (user?.role !== 'productora') return logs;
  if (!company) return [];
  return logs.filter((l) => l.company === company);
}