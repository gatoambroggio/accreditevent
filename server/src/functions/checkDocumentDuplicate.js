// Verifica si ya existe un documento del mismo tipo para la persona/empresa.
export async function checkDocumentDuplicate({ person_id, company, document_type, exclude_id }, { prisma }) {
  const where = { document_type };
  if (person_id) where.person_id = person_id;
  else if (company) where.company = company;
  else return { is_duplicate: false };
  if (exclude_id) where.NOT = { id: exclude_id };
  const existing = await prisma.document.findFirst({ where });
  return { is_duplicate: !!existing, existing_id: existing?.id, status: existing?.status };
}