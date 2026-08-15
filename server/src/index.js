import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

async function main() {
  await prisma.$connect();
  console.log('[db] PostgreSQL conectada');

  const { app, initRealtime } = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.port, () => {
    console.log(`[accreditevent] servidor local escuchando en :${env.port} (${env.nodeEnv})`);
    console.log(`[accreditevent] LAN base: ${env.lanBaseUrl}`);
  });

  const shutdown = async () => {
    console.log('[accreditevent] cerrando...');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});