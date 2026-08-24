// Facturación electrónica AFIP (webservice wsfev1) para las ventas del POS de
// barras. Emite el CAE en tiempo real si el servidor tiene salida a afip.gob.ar;
// si no hay internet o no hay configuración, la venta queda 'pending' y el
// batch (afipSyncPending) la factura al recuperar conexión.
//
// SDK: @afipsdk/afip.js. El certificado y la clave viven en disco del servidor
// (rutas en SystemSetting.afip.cert_path / key_path), nunca en la base. El SDK
// hace el WSAA (Token/Sign) automáticamente con el certificado.
//
// Todo es defensivo: si el SDK no está instalado, o AFIP no se alcanza, o falta
// config, devolvemos { estado: 'pending'|'error', error } sin romper la venta.
import fs from 'node:fs';
import net from 'node:net';
import { prisma } from '../db/prisma.js';

let cache = null;
let cacheAt = 0;
const TTL = 15000;

export async function getAfipConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return cache;
  try {
    const s = await prisma.systemSetting.findFirst();
    const a = s?.afip || {};
    cache = {
      enabled: a.enabled === true,
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
  } catch {
    cache = null;
  }
  cacheAt = now;
  return cache;
}

export function invalidateAfipCache() { cache = null; cacheAt = 0; }

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

let _sdk = null;
export async function getAfip() {
  const cfg = await getAfipConfig();
  if (!cfg.enabled) throw new Error('Facturación AFIP deshabilitada en Configuración');
  if (!cfg.cuit) throw new Error('AFIP sin CUIT configurado');
  if (!cfg.pto_vta) throw new Error('AFIP sin punto de venta configurado');
  if (_sdk) return _sdk;
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
  _sdk = new Afip(opts);
  return _sdk;
}

// Para Factura B a consumidor final (DocTipo 99) sin discriminar IVA: neto=total,
// iva=0. Es el caso estándar de barra. Si alicuota_iva > 0, discriminamos
// (neto=total/(1+iva), iva=total-neto).
function splitIva(total, alicuota) {
  const t = +Number(total).toFixed(2);
  const a = (Number(alicuota) || 0) / 100;
  if (a <= 0) return { neto: t, iva: 0 };
  const neto = +(t / (1 + a)).toFixed(2);
  const iva = +(t - neto).toFixed(2);
  return { neto, iva };
}

// Emite el CAE para una venta ya persistida (status=paid). Devuelve el estado a
// guardar en el BarSale. No lanza: todo error se devuelve como { estado, error }.
export async function issueCaeForSale(prisma, sale) {
  const cfg = await getAfipConfig();
  if (!cfg.enabled) return { estado: 'pending', error: 'Facturación AFIP deshabilitada' };
  if (!cfg.cuit || !cfg.pto_vta) return { estado: 'pending', error: 'AFIP sin configurar (CUIT / punto de venta)' };
  if (!(await afipReachable())) return { estado: 'pending', error: 'Sin conexión a afip.gob.ar' };

  let afip;
  try { afip = await getAfip(); } catch (e) { return { estado: 'error', error: e.message }; }

  const ptoVta = cfg.pto_vta;
  const cbteTipo = cfg.tipo_cbte;
  const { neto, iva } = splitIva(sale.total, cfg.alicuota_iva);

  //getNext voucher number (AFIP exige CbteDesde/CbteHasta). Reintenta una vez si
  // el número choca (dos ventas casi simultáneas).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const last = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
      const next = Number(last) + 1;
      const voucher = {
        CantReg: 1,
        PtoVta: ptoVta,
        CbteTipo: cbteTipo,
        Concepto: 1, // Productos
        DocTipo: 99, // Consumidor Final
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
      const res = await afip.ElectronicBilling.createVoucher(voucher);
      const cae = res && (res.CAE || res.cae);
      if (!cae) return { estado: 'error', error: 'AFIP no devolvió CAE' };
      return {
        estado: 'issued',
        cae: String(cae),
        cae_vto: String(res.CAEFchVto || res.CAEFchVencimiento || ''),
        cae_tipo: cbteTipo,
      };
    } catch (e) {
      const msg = (e.message || String(e)).slice(0, 500);
      // Error 10020 = número de comprobante ya usado → reintentar con el siguiente.
      if (/10020|ya utilizado|already used/i.test(msg) && attempt === 0) continue;
      return { estado: 'error', error: msg };
    }
  }
  return { estado: 'error', error: 'No se pudo obtener número de comprobante' };
}