import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function usePrinterSettings() {
  const [printerPersonal, setPrinterPersonal] = useState('');
  const [printerVehicular, setPrinterVehicular] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]) {
          setPrinterPersonal(all[0].printer_personal || '');
          setPrinterVehicular(all[0].printer_vehicular || '');
        }
      } catch {}
    })();
  }, []);

  return { printerPersonal, printerVehicular };
}