import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_TYPES = [
  { value: 'general', label: 'General', badge_prefix: 'GE' },
  { value: 'backstage', label: 'Backstage', badge_prefix: 'BA' },
  { value: 'technical', label: 'Técnica', badge_prefix: 'TE' },
  { value: 'vip', label: 'VIP', badge_prefix: 'VI' },
];

export function usePersonTypes() {
  const [types, setTypes] = useState(DEFAULT_TYPES);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.AccessLevel.list('-created_date', 100);
        if (data.length > 0) {
          setTypes(data.map((t) => ({
            value: t.value,
            label: t.label,
            badge_prefix: t.badge_prefix || 'GE',
          })));
        }
      } catch {}
    })();
  }, []);

  return { personTypes: types };
}