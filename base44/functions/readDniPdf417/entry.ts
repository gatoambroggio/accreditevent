import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Decodifica el código PDF417 del DNI argentino.
//
// En el servidor Ubuntu (self-hosted) esta función se resuelve en server/src/functions/
// readDniPdf417.js, que usa `zbarimg` (zbar completo, soporta PDF417) — 100% offline.
//
// En Base44 cloud NO hay zbarimg disponible (el sandbox no tiene binarios de sistema
// y un LLM no puede decodificar un código de barras 2D sin alucinar). Por eso acá
// devolvemos not-available: el frontend usa el lector nativo del navegador
// (BarcodeDetector con pdf417, disponible en Chrome/Edge/Android) como camino
// principal, y sólo cae a esta función cuando el navegador no decode — caso que
// en producción se resuelve con zbarimg del servidor Ubuntu.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({
      ok: false,
      error: 'La decodificación PDF417 en servidor requiere el despliegue self-hosted (Ubuntu con zbar-tools). En Base44 cloud el lector usa el motor nativo del navegador (BarcodeDetector).',
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}