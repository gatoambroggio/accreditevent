// Ruta pública para las funciones de barra que usa la TABLET (no tiene token de
// plataforma): login de operador, creación de ventas y heartbeat de tablet.
// El dispatcher general /api/functions exige auth (token de plataforma), por eso
// estas tres funciones viven acá, sin requireAuth. El operador se valida por
// operator_id dentro del payload (igual que la versión cloud con service-role).
// manageBarOperator NO va acá: la llama el admin desde el panel (con token) y va
// en el dispatcher general /api/functions.

import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { barOperatorLogin } from '../functions/barOperatorLogin.js';
import { barSale } from '../functions/barSale.js';
import { barTabletHeartbeat } from '../functions/barTabletHeartbeat.js';

export const barFunctionsRouter = Router();

const handlers = { barOperatorLogin, barSale, barTabletHeartbeat };

// Same contract que el dispatcher general: responde { data: out } (HTTP 200
// incluso para errores lógicos), y el frontend revisa out.error.
barFunctionsRouter.post('/:name', async (req, res) => {
  try {
    const handler = handlers[req.params.name];
    if (!handler) return res.status(404).json({ error: `Función no encontrada: ${req.params.name}` });
    const out = await handler(req.body || {}, { prisma });
    res.json({ data: out });
  } catch (e) {
    console.error(`[bar-fn ${req.params.name}]`, e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
});