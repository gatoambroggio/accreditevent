import { WebSocketServer } from 'ws';

let wss = null;
const subscribers = new Map(); // entityName -> Set<ws>

export function initRealtime(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'subscribe' && msg.entity) {
          if (!subscribers.has(msg.entity)) subscribers.set(msg.entity, new Set());
          subscribers.get(msg.entity).add(ws);
          ws._subs = ws._subs || new Set();
          ws._subs.add(msg.entity);
        }
      } catch {}
    });
    ws.on('close', () => {
      if (ws._subs) for (const e of ws._subs) subscribers.get(e)?.delete(ws);
    });
  });
}

// Emite un evento de entidad a los suscriptores. Llamar tras create/update/delete.
export function broadcast(entityName, event) {
  const set = subscribers.get(entityName);
  if (!set) return;
  const payload = JSON.stringify({ entity: entityName, ...event });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}