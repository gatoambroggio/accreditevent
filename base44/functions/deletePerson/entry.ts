import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { person_id } = body;

    if (!person_id) {
      return Response.json({ error: 'Falta person_id' }, { status: 400 });
    }

    // Get person info before deletion
    const person = await base44.asServiceRole.entities.Person.get(person_id);
    if (!person) {
      return Response.json({ error: 'Persona no encontrada' }, { status: 404 });
    }

    // Get accreditation IDs for access log cleanup
    const accreditations = await base44.asServiceRole.entities.Accreditation.filter(
      { person_id },
      '-created_date',
      500
    );
    const accredIds = accreditations.map((a) => a.id);

    // Delete ALL related records in parallel
    await Promise.all([
      base44.asServiceRole.entities.Biometric.deleteMany({ person_id }),
      base44.asServiceRole.entities.Document.deleteMany({ person_id }),
      base44.asServiceRole.entities.Vehicle.deleteMany({ person_id }),
      base44.asServiceRole.entities.ZKTecoCommand.deleteMany({ person_id }),
      base44.asServiceRole.entities.Accreditation.deleteMany({ person_id }),
      base44.asServiceRole.entities.ProviderRequest.deleteMany({ person_id }),
      base44.asServiceRole.entities.AuditLog.deleteMany({ entity_id: person_id }),
      ...accredIds.map((id) =>
        base44.asServiceRole.entities.AccessLog.deleteMany({ accreditation_id: id })
      ),
    ]);

    // Finally delete the person
    await base44.asServiceRole.entities.Person.delete(person_id);

    // Audit log
    await base44.asServiceRole.entities.AuditLog.create({
      actor_name: user.full_name || user.email,
      actor_id: user.id,
      action: 'delete-person-cascade',
      entity: 'Person',
      entity_id: person_id,
      detail: `${person.full_name} — eliminado con biometría, acreditaciones, documentos, vehículos y logs`,
    });

    return Response.json({ success: true, person_name: person.full_name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}