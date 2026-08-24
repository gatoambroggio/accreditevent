import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { authRouter } from './auth/routes.js';
import { requireAuth, attachUser } from './auth/middleware.js';
import { healthRouter } from './routes/health.js';
import { eventsRouter } from './routes/events.js';
import { personsRouter } from './routes/persons.js';
import { accreditationsRouter } from './routes/accreditations.js';
import { accessRouter } from './routes/access.js';
import { pdaRouter } from './routes/pda.js';
import { filesRouter } from './routes/files.js';
import { patentesRouter } from './routes/patentes.js';
import { functionInvokeRouter } from './routes/functions.js';
import { settingsRouter } from './routes/settings.js';
import { downloadsRouter } from './routes/downloads.js';
import { importRouter } from './routes/import.js';
import { usersRouter } from './routes/users.js';
import { webhooksRouter } from './routes/webhooks.js';
import { ticketsPublicRouter, ticketsAdminRouter, ticketAccessRouter } from './routes/tickets.js';
import { mercadoPagoRouter } from './routes/mercadopago.js';
import { makeCrudRouter } from './rls/middleware.js';
import { initRealtime, broadcast } from './realtime/ws.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '8mb' }));

  // Asegura el directorio de uploads.
  fs.mkdirSync(env.uploadDir, { recursive: true });

  // Estáticos: uploads y (en producción) el build del frontend React.
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));
  // El build de React se sirve por Nginx en prod, pero exponemos /models para
  // que face-api.js cargue los pesos desde el servidor local (air-gapped).
  app.use('/models', express.static(path.resolve('public/models')));

  // Health + auth (públicos)
  app.use('/api/health', healthRouter);
  // Descargas de binarios del agente de impresión (.exe Windows, binarios macOS, .js)
  app.use('/api/downloads', downloadsRouter);
  app.use('/api/auth', authRouter);

  // Webhooks de hardware: públicos (la terminal Dahua/ZKTeco no tiene token).
  // Se autentican por api_key en query.
  app.use('/api/webhooks', webhooksRouter);
  // Webhook + tienda pública de entradas: públicos (Mercado Pago y compradores anónimos).
  app.use('/api/webhooks/mercadopago', mercadoPagoRouter);
  app.use('/api/public/tickets', ticketsPublicRouter);

  // Todo lo demás requiere auth (adjunta user a req.user).
  app.use('/api/files', requireAuth, filesRouter);
  app.use('/api/patentes', requireAuth, patentesRouter);
  app.use('/api/functions', requireAuth, functionInvokeRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/import', requireAuth, importRouter);

  // CRUD genérico con RLS por entidad.
  app.use('/api/events', requireAuth, eventsRouter);
  app.use('/api/people', requireAuth, personsRouter);
  app.use('/api/accreditations', requireAuth, accreditationsRouter);
  app.use('/api/access', requireAuth, accessRouter);
  app.use('/api/pda', requireAuth, pdaRouter);
  app.use('/api/users', requireAuth, usersRouter);

  // CRUD genéricos con RLS para el resto del slice.
  app.use('/api/vehicles', requireAuth, makeCrudRouter('Vehicle'));
  app.use('/api/access-levels', requireAuth, makeCrudRouter('AccessLevel'));
  app.use('/api/parking-sectors', requireAuth, makeCrudRouter('ParkingSector'));
  app.use('/api/companies', requireAuth, makeCrudRouter('Company'));
  app.use('/api/biometrics', requireAuth, makeCrudRouter('Biometric'));
  app.use('/api/pda-stations', requireAuth, makeCrudRouter('PdaStation'));
  app.use('/api/access-logs', requireAuth, makeCrudRouter('AccessLog'));
  app.use('/api/documents', requireAuth, makeCrudRouter('Document'));
  app.use('/api/document-types', requireAuth, makeCrudRouter('DocumentType'));
  app.use('/api/provider-companies', requireAuth, makeCrudRouter('ProviderCompany'));
  app.use('/api/custom-fields', requireAuth, makeCrudRouter('CustomField'));
  app.use('/api/event-company-approvals', requireAuth, makeCrudRouter('EventCompanyApproval'));
  app.use('/api/provider-requests', requireAuth, makeCrudRouter('ProviderRequest'));
  app.use('/api/requirement-items', requireAuth, makeCrudRouter('RequirementItem'));
  app.use('/api/audit-logs', requireAuth, makeCrudRouter('AuditLog'));
  app.use('/api/pending-operators', requireAuth, makeCrudRouter('PendingOperator'));
  app.use('/api/dahua-devices', requireAuth, makeCrudRouter('DahuaDevice'));
  app.use('/api/dahua-commands', requireAuth, makeCrudRouter('DahuaCommand'));
  app.use('/api/zkteco-devices', requireAuth, makeCrudRouter('ZKTecoDevice'));
  app.use('/api/zkteco-commands', requireAuth, makeCrudRouter('ZKTecoCommand'));
  // Venta de entradas (ticketera): CRUD admin + stats/export + validación en puerta.
  app.use('/api/tickets', requireAuth, makeCrudRouter('Ticket'));
  app.use('/api/ticket-types', requireAuth, makeCrudRouter('TicketType'));
  app.use('/api/ticket-sales', requireAuth, makeCrudRouter('TicketSale'));
  // Barras (POS de bebida/comida): CRUD genérico con RLS.
  app.use('/api/bars', requireAuth, makeCrudRouter('Bar'));
  app.use('/api/bar-products', requireAuth, makeCrudRouter('BarProduct'));
  app.use('/api/event-products', requireAuth, makeCrudRouter('EventProduct'));
  app.use('/api/bar-sales', requireAuth, makeCrudRouter('BarSale'));
  app.use('/api/bar-operators', requireAuth, makeCrudRouter('BarOperator'));
  app.use('/api/bar-tablets', requireAuth, makeCrudRouter('BarTablet'));
  app.use('/api/bar-pos-devices', requireAuth, makeCrudRouter('BarPosDevice'));
  app.use('/api/bar-cash-movements', requireAuth, makeCrudRouter('BarCashMovement'));
  app.use('/api/tickets-stats', requireAuth, ticketsAdminRouter);
  app.use('/api/ticket-access', requireAuth, ticketAccessRouter);

  // attachUser para rutas que quizá necesiten user sin requerir auth (webhooks)
  app.use(attachUser);

  // Error handler
  app.use((err, _req, res, _next) => {
    console.error('[app error]', err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Error interno', status });
  });

  app.set('broadcast', broadcast);
  return { app, initRealtime };
}