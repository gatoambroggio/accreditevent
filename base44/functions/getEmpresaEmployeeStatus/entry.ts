import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user?.data?.role || user?.role || '';
    if (role !== 'empresa') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const companyName = user?.data?.company || user?.company || '';
    if (!companyName) {
      return Response.json({ employees: [] });
    }

    // Service-role queries bypass RLS so the empresa can see its employees' data
    const employees = await base44.asServiceRole.entities.Person.filter(
      { company: companyName },
      '-created_date',
      500
    );
    const employeeIds = employees.map((e) => e.id);

    let accreditations = [];
    let vehicles = [];
    if (employeeIds.length > 0) {
      accreditations = await base44.asServiceRole.entities.Accreditation.filter(
        { person_id: { $in: employeeIds } },
        '-created_date',
        1000
      );
      vehicles = await base44.asServiceRole.entities.Vehicle.filter(
        { person_id: { $in: employeeIds } },
        '-created_date',
        500
      );
    }

    return Response.json({
      employees,
      accreditations,
      vehicles,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}