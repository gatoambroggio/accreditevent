// Reintenta la emisión de CAE para una venta fallida (afip_estado=error), o para
// todas las que están en error si no se pasa sale_id.
import { prisma } from '../db/prisma.js';
import { issueCaeForSale } from './_afip.js';

export async function afipRetry(body, { prisma: p } = {}) {
  const db = p || prisma;
  const { sale_id } = body || {};
  if (sale_id) {
    const sale = await db.barSale.findUnique({ where: { id: sale_id } }).catch(() => null);
    if (!sale) return { error: 'Venta no encontrada', status: 404 };
    if (sale.status !== 'paid') return { error: 'La venta no está pagada', status: 400 };
    const res = await issueCaeForSale(db, sale);
    await db.barSale.update({
      where: { id: sale_id },
      data: {
        afip_estado: res.estado,
        afip_cae: res.cae || null,
        afip_cae_vto: res.cae_vto || null,
        afip_cae_tipo: res.cae_tipo || null,
        afip_error: res.error || null,
      },
    }).catch(() => {});
    return { sale_id, ...res };
  }
  // Sin sale_id: reintenta todas las que están en error.
  const failed = await db.barSale.findMany({
    where: { status: 'paid', afip_estado: 'error' },
    orderBy: { created_at: 'asc' },
    take: 100,
  }).catch(() => []);
  let issued = 0, errors = 0;
  for (const sale of failed) {
    const res = await issueCaeForSale(db, sale);
    await db.barSale.update({
      where: { id: sale.id },
      data: {
        afip_estado: res.estado,
        afip_cae: res.cae || null,
        afip_cae_vto: res.cae_vto || null,
        afip_cae_tipo: res.cae_tipo || null,
        afip_error: res.error || null,
      },
    }).catch(() => {});
    if (res.estado === 'issued') issued++; else errors++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: true, retried: failed.length, issued, errors };
}