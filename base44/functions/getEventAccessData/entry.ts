import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Devuelve las acreditaciones activas y los vehículos del evento indicado.
// Se ejecuta con rol de servicio (asServiceRole) para NO depender del RLS del
// operador (problema conocido de casing entre User.company y Company.name que
// dejaba la caché offline vacía). Así la PDA siempre obtiene los datos del
// evento asignado y el modo offline funciona.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const eventId = body?.event_id;
    if (!eventId) return Response.json({ error: 'event_id requerido' }, { status: 400 });

    const [accs, vehs] = await Promise.all([
      base44.asServiceRole.entities.Accreditation.filter({ status: { $in: ['active', 'blocked', 'revoked'] } }, '-created_date', 5000),
      base44.asServiceRole.entities.Vehicle.list('-created_date', 5000),
    ]);

    // Incluye activas, bloqueadas y revocadas: las bloqueadas/revocadas se
    // detectan offline como "canceladas" al validar el status, en lugar de
    // quedar como "no encontradas".
    const accreditations = (accs || []).filter((a) => a.event_id === eventId);
    const vehicles = (vehs || []).filter((v) => (v.event_ids || []).includes(eventId));

    return Response.json({ accreditations, vehicles });
  } catch (error) {
    return Response.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
}