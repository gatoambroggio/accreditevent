import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { logAudit } from './audit';

export function useCrud(entityName, { sort = '-created_date', limit = 200, filter = null } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = filter
        ? await base44.entities[entityName].filter(filter, sort, limit)
        : await base44.entities[entityName].list(sort, limit);
      setItems(data);
    } catch (err) {
      setError(err.message || 'Error al cargar los registros.');
    } finally {
      setLoading(false);
    }
  }, [entityName, sort, limit, JSON.stringify(filter)]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (data) => {
    const created = await base44.entities[entityName].create(data);
    await logAudit('create', entityName, created.id, data.name || data.full_name || data.badge_code || data.document_type || '');
    setItems((prev) => [created, ...prev]);
    return created;
  };

  const update = async (id, data) => {
    const updated = await base44.entities[entityName].update(id, data);
    await logAudit('update', entityName, id, data.name || data.full_name || data.badge_code || data.document_type || '');
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updated } : i)));
    return updated;
  };

  const remove = async (id) => {
    await base44.entities[entityName].delete(id);
    await logAudit('delete', entityName, id, '');
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, error, reload: load, create, update, remove };
}