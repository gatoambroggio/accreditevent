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

  // Sincronización automática de CAE pendientes cada 15 minutos. En el servidor
  // self-hosted (air-gapped) no corre el motor de workflows de Base44, así que lo
  // disparamos acá. Sólo factura empresas en modo producción con salida a AFIP.
  setInterval(async () => {
    try {
      const { afipSyncPending } = await import('./functions/afipSyncPending.js');
      const r = await afipSyncPending({}, { prisma });
      if (r && r.processed) console.log(`[afip-sync] procesadas: ${r.processed} · emitidas: ${r.issued ?? 0} · errores: ${r.errors ?? 0}`);
    } catch (e) {
      console.error('[afip-sync] error:', e.message);
    }
  }, 15 * 60 * 1000);

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