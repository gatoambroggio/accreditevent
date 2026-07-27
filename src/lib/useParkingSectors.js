import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

export function useParkingSectors() {
  const [sectors, setSectors] = useState([]);

  const refetch = useCallback(async () => {
    try {
      const items = await base44.entities.ParkingSector.list('-created_date', 100);
      setSectors(items || []);
    } catch {
      setSectors([]);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { sectors, refetch };
}