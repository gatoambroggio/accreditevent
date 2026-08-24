// Factura en lote las ventas pagadas que aún no tienen CAE (pending/error o sin
// estado). Se ejecuta cada 15 min (scheduler del server) o manualmente desde el
// panel de reportes. Cada venta se factura con el pto_vta de su barra (override
// de modo incluido); issueCaeForSale resuelve la config final empresa+barra y
// decide el estado (issued / sandbox / none / pending). Procesa de a 50 con una
// pausa suave entre comprobantes para no saturar AFIP.
import { prisma } from '../db/prisma.js';
import { issueCaeForSale } from './_afip.js';

export async function afipSyncPending(body, { prisma: p } = {}) {
  const db = p || prisma;
  const { limit } = body || {};

  const pending = await db.barSale.findMany({
    where: { status: 'paid', afip_estado: { in: ['pending', 'error', null, ''] } },
    orderBy: { created_at: 'asc' },
    take: Number(limit) || 50,
  }).catch(() => []);

  let issued = 0, errors = 0, skipped = 0, sandbox = 0, noneCount = 0;
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
        afip_pto_vta: res.pto_vta ?? null,
        afip_error: res.error || null,
      },
    }).catch(() => {});
    if (res.estado === 'issued') issued++;
    else if (res.estado === 'error') errors++;
    else if (res.estado === 'sandbox') sandbox++;
    else if (res.estado === 'none') noneCount++;
    else skipped++;
    details.push({ sale_id: sale.id, estado: res.estado, error: res.error });
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: true, processed: pending.length, issued, errors, sandbox, none: noneCount, skipped, details };
}