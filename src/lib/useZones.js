import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { DEFAULT_ZONES } from './accessZones';

export function useZones() {
  const [zones, setZones] = useState(DEFAULT_ZONES);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]?.zones?.length) {
          setZones(all[0].zones);
        }
      } catch {}
    })();
  }, []);

  return { zones };
}