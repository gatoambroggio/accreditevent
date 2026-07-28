import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const ADMIN_ROLES = ['superadmin', 'admin'];
    if (!ADMIN_ROLES.includes(user.role)) {
      return Response.json({ error: 'Solo un administrador puede ejecutar esta limpieza.' }, { status: 403 });
    }

    // 1. Delete all Biometric records
    const bios = await base44.asServiceRole.entities.Biometric.list('-created_date', 500);
    let deletedCount = 0;
    for (const b of bios) {
      try {
        await base44.asServiceRole.entities.Biometric.delete(b.id);
        deletedCount++;
      } catch {}
    }

    // 2. Reset has_biometric flag on all Accreditations
    const accreditations = await base44.asServiceRole.entities.Accreditation.list('-created_date', 500);
    let resetCount = 0;
    const updates = accreditations
      .filter((a) => a.has_biometric)
      .map((a) => ({ id: a.id, has_biometric: false }));
    if (updates.length > 0) {
      await base44.asServiceRole.entities.Accreditation.bulkUpdate(updates);
      resetCount = updates.length;
    }

    return Response.json({
      success: true,
      message: `Limpieza completada: ${deletedCount} registro(s) biométrico(s) eliminado(s), ${resetCount} acreditación(es) reseteada(s).`,
      deleted_biometrics: deletedCount,
      reset_accreditations: resetCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}