// Aviso de vencimiento de documentos. En air-gap no hay email saliente: marca
// expiry_notified_at y registra en log del server los documentos por vencer.
const DAYS_THRESHOLD = 7;

export async function notifyExpiringDocuments(_payload, { prisma }) {
  const now = new Date();
  const threshold = new Date(now.getTime() + DAYS_THRESHOLD * 24 * 60 * 60 * 1000);
  const docs = await prisma.document.findMany({ where: { status: 'approved' } });
  const expiring = docs.filter((d) => d.expires_at && !d.expiry_notified_at && d.expires_at >= now && d.expires_at <= threshold);
  let notified = 0;
  for (const doc of expiring) {
    let person = null;
    if (doc.person_id) person = await prisma.person.findUnique({ where: { id: doc.person_id } });
    if (!person?.email) { await prisma.document.update({ where: { id: doc.id }, data: { expiry_notified_at: now } }); continue; }
    // air-gap: logueamos el aviso (configurar SMTP local para envío real).
    console.log(`[aviso-vencimiento] ${person.email} — documento "${doc.document_type || doc.original_name}" vence ${doc.expires_at.toISOString().slice(0, 10)}`);
    await prisma.document.update({ where: { id: doc.id }, data: { expiry_notified_at: now } });
    notified++;
  }
  return { notified, total_expiring: expiring.length };
}