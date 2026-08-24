// Emite (o reemite) el CAE de AFIP para una venta del POS ya pagada.
// body: { sale_id }
import { prisma } from '../db/prisma.js';
import { issueCaeForSale } from './_afip.js';

export async function afipIssue(body, { prisma: p }) {
  const db = p || prisma;
  const { sale_id } = body;
  if (!sale_id) return { error: 'Falta sale_id', status: 400 };
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