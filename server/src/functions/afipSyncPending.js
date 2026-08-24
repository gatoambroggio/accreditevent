// Factura en lote las ventas pagadas que aún no tienen CAE (pending/error o sin
// estado), pertenecientes a empresas en modo PRODUCCIÓN. Se ejecuta cada 15 min
// (workflow + scheduler del server) o manualmente desde el panel de reportes.
// Agrupa por empresa: cada empresa factura con su propio CUIT/cert. Procesa de
// a 50 con una pausa suave entre comprobantes para no saturar AFIP.
import { prisma } from '../db/prisma.js';
import { issueCaeForSale, afipReachable } from './_afip.js';

export async function afipSyncPending(body, { prisma: p } = {}) {
  const db = p || prisma;
  const { limit } = body || {};
  if (!(await afipReachable())) return { ok: true, reachable: false, message: 'Sin conexión a AFIP' };

  // Empresas en modo producción con CUIT y punto de venta configurados.
  const companies = await db.company.findMany().catch(() => []);
  const prodNames = new Set(
    (companies || [])
      .filter((c) => c.afip && c.afip.modo === 'production' && c.afip.cuit && c.afip.pto_vta)
      .map((c) => c.name)
  );
  if (prodNames.size === 0) {
    return { ok: true, reachable: true, processed: 0, issued: 0, errors: 0, skipped: 0, details: [], message: 'No hay empresas en modo producción' };
  }

  const pending = await db.barSale.findMany({
    where: { status: 'paid', afip_estado: { in: ['pending', 'error', null, ''] }, company: { in: [...prodNames] } },
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
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ok: true, reachable: true, processed: pending.length, issued, errors, skipped, details };
}