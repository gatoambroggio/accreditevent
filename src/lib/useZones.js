import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { DEFAULT_ZONES } from './accessZones';

export function useZones() {
  const [zones, setZones] = useState(DEFAULT_ZONES);

  useEffect(() => {
    (async () => {
      try {
        // Try SystemSetting zones first
        const settings = await base44.entities.SystemSetting.list('-created_date', 1);
        if (settings[0]?.zones?.length > 0) {
          setZones(settings[0].zones);
          return;
        }
        // Fallback to AccessLevel entity
        const levels = await base44.entities.AccessLevel.list('-created_date', 100);
        if (levels.length > 0) {
          setZones(levels.map((l) => ({ value: l.value, label: l.label })));
        }
      } catch {}
    })();
  }, []);

  return { zones };
}