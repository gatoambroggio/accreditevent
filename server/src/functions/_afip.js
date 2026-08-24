// Facturación electrónica AFIP (wsfev1) — MULTIEMPRESA. Cada empresa productora
// (Company) configura su propio CUIT, certificado, punto de venta y modo
// (production | sandbox | disabled). La venta se factura bajo la productora
// dueña del evento (sale.company → Company por nombre).
//
// SDK: @afipsdk/afip.js. El certificado y la clave viven en disco del servidor
// (rutas en Company.afip.cert_path / key_path), nunca en la base. El SDK hace
// el WSAA (Token/Sign) automáticamente con el certificado.
//
// Todo es defensivo: si el SDK no está instalado, AFIP no se alcanza, o falta
// config, devolvemos { estado, error } sin romper la venta.
import fs from 'node:fs';
import net from 'node:net';

// Cache de config de AFIP por companyId (TTL 15s) y de instancias del SDK.
const cfgCache = new Map(); // companyId -> { data, at }
const sdkCache = new Map(); // companyId -> Afip instance
const CFG_TTL = 15000;

// Resuelve la Company por nombre o id y devuelve su config AFIP normalizada.
// companyIdentifier = sale.company (nombre) | Company.id
export async function getCompanyAfipConfig(prisma, companyIdentifier) {
  if (!companyIdentifier) return null;
  let company = await prisma.company.findUnique({ where: { id: companyIdentifier } }).catch(() => null);
  if (!company) company = await prisma.company.findFirst({ where: { name: companyIdentifier } }).catch(() => null);
  if (!company) return null;
  const now = Date.now();
  const cached = cfgCache.get(company.id);
  if (cached && now - cached.at < CFG_TTL) return { companyId: company.id, afip: cached.data };
  const a = company.afip || {};
  const data = {
    modo: a.modo || 'disabled',
    cuit: a.cuit ? String(a.cuit).replace(/[^0-9]/g, '') : '',
    razon_social: a.razon_social || '',
    pto_vta: Number(a.pto_vta) || 0,
    tipo_cbte: Number(a.tipo_cbte) || 6,
    cond_iva: a.cond_iva || 'responsable_inscripto',
    alicuota_iva: Number(a.alicuota_iva) || 0,
    access_token: a.access_token || '',
    cert_path: a.cert_path || '',
    key_path: a.key_path || '',
  };
  cfgCache.set(company.id, { data, at: now });
  return { companyId: company.id, afip: data };
}

export function invalidateAfipCache(companyId) {
  if (companyId) {
    cfgCache.delete(companyId);
    sdkCache.delete(companyId);
  } else {
    cfgCache.clear();
    sdkCache.clear();
  }
}

// Probe de alcanzabilidad a afip.gob.ar:443 (<1.5s). En un servidor sin salida a
// internet, detectarlo rápido evita esperar el timeout de fetch y marca la
// venta como 'pending' de inmediato. Se cachea 60s.
let reachCache = null;
let reachAt = 0;
function probeHost(host, port, ms = 1500) {
  return Promise.race([
    new Promise((resolve) => {
      const sock = net.createConnection({ host, port });
      const t = setTimeout(() => { sock.destroy(); resolve(false); }, ms);
      sock.once('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
      sock.once('error', () => { clearTimeout(t); resolve(false); });
    }),
    new Promise((resolve) => setTimeout(() => resolve(false), ms + 300)),
  ]);
}
export async function afipReachable() {
  const now = Date.now();
  if (reachCache !== null && now - reachAt < 60000) return reachCache;
  reachAt = now;
  let ok = false;
  try { ok = await probeHost('afip.gob.ar', 443, 1500); } catch { ok = false; }
  reachCache = ok;
  return ok;
}
export function invalidateAfipReachability() { reachCache = null; reachAt = 0; }

// Instancia del SDK por empresa (cacheada por companyId).
export async function getCompanyAfip(prisma, companyId, cfg) {
  if (sdkCache.has(companyId)) return sdkCache.get(companyId);
  if (!cfg.cuit) throw new Error('AFIP sin CUIT configurado para esta empresa');
  if (!cfg.pto_vta) throw new Error('AFIP sin punto de venta configurado');
  let Afip;
  try {
    const mod = await import('@afipsdk/afip.js');
    Afip = mod.default || mod;
  } catch {
    throw new Error('SDK de AFIP no instalado en el servidor. Ejecutá: cd server && npm install @afipsdk/afip.js');
  }
  const opts = { CUIT: Number(cfg.cuit) };
  if (cfg.cert_path && cfg.key_path && fs.existsSync(cfg.cert_path) && fs.existsSync(cfg.key_path)) {
    opts.cert = fs.readFileSync(cfg.cert_path, 'utf8');
    opts.key = fs.readFileSync(cfg.key_path, 'utf8');
  }
  if (cfg.access_token) opts.access_token = cfg.access_token;
  const inst = new Afip(opts);
  sdkCache.set(companyId, inst);
  return inst;
}

// Para Factura B a consumidor final (DocTipo 99) sin discriminar IVA: neto=total,
// iva=0. Es el caso estándar de barra. Si alicuota_iva > 0, discriminamos.
function splitIva(total, alicuota) {
  const t = +Number(total).toFixed(2);
  const a = (Number(alicuota) || 0) / 100;
  if (a <= 0) return { neto: t, iva: 0 };
  const neto = +(t / (1 + a)).toFixed(2);
  const iva = +(t - neto).toFixed(2);
  return { neto, iva };
}

// Resuelve la empresa productora de una venta (sale.company; fallback al
// event.company). Devuelve { companyId, afip } o null si no hay empresa.
async function resolveCompanyForSale(prisma, sale) {
  let companyName = sale.company;
  let bar = null;
  if (sale.bar_id) bar = await prisma.bar.findUnique({ where: { id: sale.bar_id } }).catch(() => null);
  if (!companyName && bar?.company) companyName = bar.company;
  if (!companyName && sale.event_id) {
    const ev = await prisma.event.findUnique({ where: { id: sale.event_id } }).catch(() => null);
    companyName = ev?.company;
  }
  if (!companyName) return null;
  const res = await getCompanyAfipConfig(prisma, companyName);
  if (!res) return null;
  // Merge: la empresa es la base (CUIT/cert/razon_social/modo default). La
  // barra sobrescribe el modo (override) y define su propio pto_vta, para que
  // cada barra emita con numeración independiente. Sin pto_vta en la barra, no
  // se factura (afip_estado=none).
  const cfg = { ...res.afip, pto_vta: 0 };
  const barAfip = bar?.afip || {};
  if (barAfip.modo_override) cfg.modo = barAfip.modo_override;
  if (barAfip.pto_vta) cfg.pto_vta = Number(barAfip.pto_vta);
  return { companyId: res.companyId, afip: cfg };
}

// Emite el CAE para una venta ya persistida (status=paid), bajo la empresa
// productora del evento. Respeta el modo: production→CAE real, sandbox→no
// fiscal, disabled→none. No lanza: todo error se devuelve como { estado, error }.
export async function issueCaeForSale(prisma, sale) {
  const res = await resolveCompanyForSale(prisma, sale);
  if (!res) return { estado: 'none', error: 'La empresa productora no tiene AFIP configurado' };
  const { companyId, afip: cfg } = res;
  if (cfg.modo === 'disabled') return { estado: 'none', error: 'Facturación AFIP deshabilitada' };
  if (cfg.modo === 'sandbox') return { estado: 'sandbox', pto_vta: cfg.pto_vta || null, error: 'Modo pruebas (comprobante no fiscal)' };
  if (!cfg.cuit) return { estado: 'none', error: 'La empresa no tiene CUIT configurado' };
  if (!cfg.pto_vta) return { estado: 'none', error: 'La barra no tiene punto de venta AFIP configurado' };
  if (!(await afipReachable())) return { estado: 'pending', pto_vta: cfg.pto_vta, error: 'Sin conexión a afip.gob.ar' };

  let afip;
  try { afip = await getCompanyAfip(prisma, companyId, cfg); } catch (e) { return { estado: 'error', error: e.message }; }

  const ptoVta = cfg.pto_vta;
  const cbteTipo = cfg.tipo_cbte;
  const { neto, iva } = splitIva(sale.total, cfg.alicuota_iva);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const last = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
      const next = Number(last) + 1;
      const voucher = {
        CantReg: 1,
        PtoVta: ptoVta,
        CbteTipo: cbteTipo,
        Concepto: 1,
        DocTipo: 99,
        DocNro: 0,
        CbteDesde: next,
        CbteHasta: next,
        ImpTotal: +Number(sale.total).toFixed(2),
        ImpTotConc: 0,
        ImpNeto: neto,
        ImpOpEx: 0,
        ImpTrib: 0,
        ImpIVA: iva,
        MonId: 'PES',
        MonCotiz: 1,
      };
      const r = await afip.ElectronicBilling.createVoucher(voucher);
      const cae = r && (r.CAE || r.cae);
      if (!cae) return { estado: 'error', error: 'AFIP no devolvió CAE' };
      return {
        estado: 'issued',
        cae: String(cae),
        cae_vto: String(r.CAEFchVto || r.CAEFchVencimiento || ''),
        cae_tipo: cbteTipo,
        pto_vta: ptoVta,
      };
    } catch (e) {
      const msg = (e.message || String(e)).slice(0, 500);
      if (/10020|ya utilizado|already used/i.test(msg) && attempt === 0) continue;
      return { estado: 'error', error: msg };
    }
  }
  return { estado: 'error', error: 'No se pudo obtener número de comprobante' };
}