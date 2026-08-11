import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getPendingLogs, writePendingLogs } from '@/lib/offlineAccess';

// Sincroniza los registros de acceso encolados offline cuando vuelve la conexión.
export function useOfflineSync(online) {
  const [pendingCount, setPendingCount] = useState(() => getPendingLogs().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!online) return;
    const logs = getPendingLogs();
    if (logs.length === 0) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      const remaining = [];
      for (const log of logs) {
        if (cancelled) {
          remaining.push(log);
          continue;
        }
        try {
          await base44.entities.AccessLog.create(log);
        } catch {
          remaining.push(log);
        }
      }
      if (!cancelled) {
        writePendingLogs(remaining);
        setPendingCount(remaining.length);
        setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online]);

  return { pendingCount, syncing, refresh: () => setPendingCount(getPendingLogs().length) };
}