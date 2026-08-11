import { useState, useEffect } from 'react';

const KEY = 'accreditevent.scan_mode';

// Modo de escaneo persistido por dispositivo: 'camera' | 'scanner'
// (escáner físico tipo PDA Zebra = keyboard wedge via DataWedge)
export function useScanMode() {
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return 'camera';
    try {
      return localStorage.getItem(KEY) === 'scanner' ? 'scanner' : 'camera';
    } catch {
      return 'camera';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
  }, [mode]);

  return [mode, setMode];
}