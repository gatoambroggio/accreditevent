import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getCachedVerifier } from '@/lib/offlineAccess';

const STORAGE_KEY = 'accreditevent.pda_number';
const HEARTBEAT_MS = 45000;

// Lee el nivel de batería del dispositivo (Battery API). Devuelve null si no
// está disponible (Safari/Firefox o webview sin soporte). Fallback silencioso.
async function getBatteryLevel() {
  try {
    if (!navigator || typeof navigator.getBattery !== 'function') return null;
    const battery = await navigator.getBattery();
    if (!battery || typeof battery.level !== 'number') return null;
    return Math.round(battery.level * 100);
  } catch {
    return null;
  }
}

// Número de PDA seteado una sola vez por dispositivo (módulo PDA ID).
// Se comparte entre todos los controles de acceso (QR personas, vehicular, manual).
export function usePdaNumber() {
  const [pdaNumber, setPdaNumber] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, pdaNumber); } catch {}
  }, [pdaNumber]);
  return [pdaNumber, setPdaNumber];
}

// Registra la PDA en el backend y envía heartbeat mientras el control esté activo.
// enabled: si el control está activo; event: evento seleccionado; mode: person|vehicle;
// zones/sectors: selección actual; pendingCount: logs offline pendientes.
export function usePdaHeartbeat({ enabled, event, mode = 'person', zones = [], sectors = [], pendingCount = 0 }) {
  const [pdaNumber] = usePdaNumber();
  const pdaIdRef = useRef(null);
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;

  const register = useCallback(async () => {
    if (!pdaNumber || !event) return;
    const verifier = getCachedVerifier();
    const batteryLevel = await getBatteryLevel();
    const payload = {
      station_number: pdaNumber,
      event_id: event.id,
      event_name: event.name,
      company: event.company || '',
      operator_name: verifier || '',
      mode,
      assigned_zone: mode === 'person' ? zones.join(', ') : sectors.join(', '),
      assigned_sectors: sectors,
      last_seen: new Date().toISOString(),
      pending_sync: pendingCountRef.current || 0,
      battery_level: batteryLevel,
    };
    try {
      const existing = await base44.entities.PdaStation.filter({ station_number: pdaNumber, event_id: event.id }, '-created_date', 5);
      if (existing && existing.length > 0) {
        const id = existing[0].id;
        await base44.entities.PdaStation.update(id, payload);
        pdaIdRef.current = id;
      } else {
        const created = await base44.entities.PdaStation.create(payload);
        pdaIdRef.current = created?.id || null;
      }
    } catch {}
  }, [pdaNumber, event, mode, zones, sectors]);

  useEffect(() => {
    if (!enabled || !event || !pdaNumber) return;
    register();
  }, [enabled, event, pdaNumber, register]);

  useEffect(() => {
    if (!enabled) return;
    const beat = async () => {
      const id = pdaIdRef.current;
      if (!id) return;
      try {
        const batteryLevel = await getBatteryLevel();
        const update = {
          last_seen: new Date().toISOString(),
          pending_sync: pendingCountRef.current || 0,
        };
        if (batteryLevel != null) update.battery_level = batteryLevel;
        await base44.entities.PdaStation.update(id, update);
      } catch {}
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return { pdaNumber };
}