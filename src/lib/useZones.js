import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { DEFAULT_ZONES } from './accessZones';

export function useZones() {
  const [zones, setZones] = useState(DEFAULT_ZONES);

  useEffect(() => {
    (async () => {
      try {
        const levels = await base44.entities.AccessLevel.list('-created_date', 100);
        if (levels.length > 0) {
          setZones(levels.map((l) => ({ value: l.value, label: l.label })));
        }
      } catch {}
    })();
  }, []);

  return { zones };
}