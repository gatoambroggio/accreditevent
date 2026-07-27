import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_TYPES = [
  { value: 'provider', label: 'Proveedor', badge_prefix: 'PR' },
  { value: 'technician', label: 'Técnico', badge_prefix: 'TE' },
  { value: 'staff', label: 'Staff', badge_prefix: 'ST' },
  { value: 'press', label: 'Prensa', badge_prefix: 'PS' },
  { value: 'artist', label: 'Artista', badge_prefix: 'AR' },
  { value: 'guest', label: 'Invitado', badge_prefix: 'GU' },
];

export function usePersonTypes() {
  const [types, setTypes] = useState(DEFAULT_TYPES);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.PersonType.list('-created_date', 100);
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