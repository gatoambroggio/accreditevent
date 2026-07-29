import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useCustomFields(entityName) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityName) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const all = await base44.entities.CustomField.filter(
          { entity_name: entityName, is_active: true },
          'sort_order',
          200
        );
        if (active) setFields(all);
      } catch {
        /* custom fields not available */
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [entityName]);

  return { customFields: fields, loading };
}