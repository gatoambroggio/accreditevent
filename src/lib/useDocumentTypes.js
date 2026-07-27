import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_DOC_TYPES = [
  { value: 'dni', label: 'DNI' },
  { value: 'work_insurance', label: 'Seguro de trabajo' },
  { value: 'tax_certificate', label: 'Certificado fiscal' },
  { value: 'contract', label: 'Contrato' },
  { value: 'other', label: 'Otro' },
];

export function useDocumentTypes() {
  const [docTypes, setDocTypes] = useState(DEFAULT_DOC_TYPES);
  const [rawItems, setRawItems] = useState([]);

  const refetch = useCallback(async () => {
    try {
      const types = await base44.entities.DocumentType.list('-created_date', 100);
      setRawItems(types);
      if (types.length > 0) {
        setDocTypes(types.map((t) => ({ value: t.value, label: t.label })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { docTypes, rawItems, refetch };
}