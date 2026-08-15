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
  app.use('/api/auth', authRouter);

  // Todo lo demás requiere auth (adjunta user a req.user). Las rutas públicas
  // de hardware (webhooks) se montan aparte sin requireAuth.
  app.use('/api/files', requireAuth, filesRouter);
  app.use('/api/patentes', requireAuth, patentesRouter);
  app.use('/api/functions', requireAuth, functionInvokeRouter);
  app.use('/api/settings', requireAuth, settingsRouter);

  // CRUD genérico con RLS por entidad.
  app.use('/api/events', requireAuth, eventsRouter);
  app.use('/api/people', requireAuth, personsRouter);
  app.use('/api/accreditations', requireAuth, accreditationsRouter);
  app.use('/api/access', requireAuth, accessRouter);
  app.use('/api/pda', requireAuth, pdaRouter);

  // CRUD genéricos con RLS para el resto del slice.
  app.use('/api/vehicles', requireAuth, makeCrudRouter('Vehicle'));
  app.use('/api/access-levels', requireAuth, makeCrudRouter('AccessLevel'));
  app.use('/api/parking-sectors', requireAuth, makeCrudRouter('ParkingSector'));
  app.use('/api/companies', requireAuth, makeCrudRouter('Company'));
  app.use('/api/biometrics', requireAuth, makeCrudRouter('Biometric'));
  app.use('/api/pda-stations', requireAuth, makeCrudRouter('PdaStation'));
  app.use('/api/access-logs', requireAuth, makeCrudRouter('AccessLog'));

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