import { base44 } from '@/api/base44Client';

let cachedUser = null;

async function getCurrentUser() {
  if (cachedUser) return cachedUser;
  try {
    cachedUser = await base44.auth.me();
    return cachedUser;
  } catch {
    return null;
  }
}

export function clearCachedUser() {
  cachedUser = null;
}

export async function logAudit(action, entity, entityId, detail = '') {
  try {
    const me = await getCurrentUser();
    await base44.entities.AuditLog.create({
      actor_name: me?.full_name || me?.email || 'Sistema',
      actor_id: me?.id || '',
      action,
      entity,
      entity_id: entityId || '',
      detail,
    });
  } catch {
    // silent — audit should never break the main flow
  }
}