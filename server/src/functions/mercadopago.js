// Mercado Pago — config (DB SystemSetting.mercadopago con fallback a env) +
// helpers para crear preferencias de Checkout Pro y notificar al comprador.
import { prisma } from '../db/prisma.js';

const ENV_MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const ENV_MP_PUBLIC = process.env.MERCADOPAGO_PUBLIC_KEY || '';
const ENV_MP_WEBHOOK = process.env.MERCADOPAGO_WEBHOOK_URL || '';
const ENV_MP_SANDBOX = process.env.MERCADOPAGO_SANDBOX === 'true';

let _cfg = null, _cfgAt = 0;
const TTL = 15000;

export async function getMpConfig() {
  const now = Date.now();
  if (_cfg && now - _cfgAt < TTL) return _cfg;
  let cfg = { accessToken: ENV_MP_TOKEN, publicKey: ENV_MP_PUBLIC, webhookUrl: ENV_MP_WEBHOOK, sandbox: ENV_MP_SANDBOX, backUrlBase: '' };
  try {
    const s = await prisma.systemSetting.findFirst();
    const v = s?.mercadopago || {};
    if (v.access_token) cfg.accessToken = v.access_token;
    if (v.public_key) cfg.publicKey = v.public_key;
    if (v.webhook_url) cfg.webhookUrl = v.webhook_url;
    if (typeof v.sandbox === 'boolean') cfg.sandbox = v.sandbox;
    if (v.back_url_base) cfg.backUrlBase = v.back_url_base;
  } catch {}
  _cfg = cfg;
  _cfgAt = now;
  return cfg;
}

export function invalidateMpCache() { _cfg = null; _cfgAt = 0; }

// Crea una preferencia de Checkout Pro en Mercado Pago.
// Devuelve { id, init_point, sandbox_init_point } o lanza.
export async function createPreference({ ticket, event, ticketType, backBase, webhookUrl, sandbox }) {
  const cfg = await getMpConfig();
  if (!cfg.accessToken) throw new Error('Mercado Pago no configurado (falta access_token). Configurarlo en Venta de entradas → Mercado Pago o en MERCADOPAGO_ACCESS_TOKEN.');
  const title = `${event.name} — ${ticketType.name}`;
  const body = {
    items: [{
      id: ticket.id,
      title,
      description: ticketType.description || title,
      quantity: ticket.quantity,
      unit_price: Number(ticket.unit_price),
      currency_id: 'ARS',
    }],
    payer: { name: ticket.buyer_name, email: ticket.buyer_email },
    external_reference: ticket.id,
    statement_descriptor: 'ACCREDITEVENT',
    auto_return: 'approved',
    back_urls: {
      success: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=success`,
      pending: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=pending`,
      failure: `${backBase}/entradas/confirmacion?ticket_id=${ticket.id}&status=failure`,
    },
    notification_url: webhookUrl || undefined,
    marketplace_fee: 0,
  };
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Mercado Pago ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    id: data.id,
    init_point: sandbox ? data.sandbox_init_point : data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  };
}

// Recupera un pago de Mercado Pago por su ID. Devuelve { status, external_reference, ... } o lanza.
export async function getPayment(paymentId) {
  const cfg = await getMpConfig();
  if (!cfg.accessToken) throw new Error('Mercado Pago no configurado');
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Mercado Pago payment ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// WhatsApp Cloud API (opcional): envía el QR/confirmación al comprador si
// SystemSetting.whatsapp_token + whatsapp_phone_id están configurados. Best-effort:
// si falla o no está configurado, no rompe el flujo de pago.
export async function notifyBuyerWhatsapp(ticket, event) {
  try {
    const s = await prisma.systemSetting.findFirst();
    const token = s?.whatsapp_token;
    const phoneId = s?.whatsapp_phone_id;
    if (!token || !phoneId || !ticket.buyer_phone) return false;
    const phone = String(ticket.buyer_phone).replace(/[^0-9]/g, '');
    const msg = `✅ Tu entrada para *${event.name}* fue confirmada.\nCódigo QR: ${ticket.qr_code}\nPresentalo en la puerta. ¡Gracias por tu compra!`;
    await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: msg },
      }),
    });
    return true;
  } catch { return false; }
}