export async function getEmpresaEmployeeStatus(_payload, { user, prisma }) {
  if (user.role !== 'empresa') throw Object.assign(new Error('Forbidden'), { status: 403 });
  const companyName = user?.data?.company || '';
  if (!companyName) return { employees: [] };
  const employees = await prisma.person.findMany({ where: { company: companyName }, orderBy: { created_at: 'desc' }, take: 500 });
  const employeeIds = employees.map((e) => e.id);
  let accreditations = [], vehicles = [], documents = [];
  if (employeeIds.length) {
    [accreditations, vehicles] = await Promise.all([
      prisma.accreditation.findMany({ where: { person_id: { in: employeeIds } }, orderBy: { created_at: 'desc' }, take: 1000 }),
      prisma.vehicle.findMany({ where: { person_id: { in: employeeIds } }, orderBy: { created_at: 'desc' }, take: 500 }),
    ]);
    const [personDocs, companyDocs] = await Promise.all([
      prisma.document.findMany({ where: { person_id: { in: employeeIds } }, orderBy: { created_at: 'desc' }, take: 1000 }),
      prisma.document.findMany({ where: { company: companyName }, orderBy: { created_at: 'desc' }, take: 500 }),
    ]);
    documents = [...personDocs, ...companyDocs];
  }
  return { employees, accreditations, vehicles, documents };
}