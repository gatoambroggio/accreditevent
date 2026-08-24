// Factura en lote las ventas pagadas que aún no tienen CAE (pending/error o sin
// estado). Se ejecuta al recuperar internet o manualmente desde el panel. Para
// no saturar AFIP procesa de a 25 y con una pequeña pausa entre comprobantes.
import { prisma } from '../db/prisma.js';
import { issueCaeForSale, afipReachable } from './_afip.js';

export async function afipSyncPending(body, { prisma: p } = {}) {
  const db = p || prisma;
  const { limit } = body || {};
  if (!(await afipReachable())) return { ok: true, reachable: false, message: 'Sin conexión a AFIP' };

  const pending = await db.barSale.findMany({
    where: { status: 'paid', afip_estado: { in: ['pending', 'error', null, ''] } },
    orderBy: { created_at: 'asc' },
    take: Number(limit) || 50,
  }).catch(() => []);

  let issued = 0, errors = 0, skipped = 0;
  const details = [];
  for (const sale of pending) {
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
    if (res.estado === 'issued') issued++;
    else if (res.estado === 'error') errors++;
    else skipped++;
    details.push({ sale_id: sale.id, estado: res.estado, error: res.error });
    await new Promise((r) => setTimeout(r, 300)); // pausa suave entre comprobantes
  }
  return { ok: true, reachable: true, processed: pending.length, issued, errors, skipped, details };
}