import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinEventPhases, speakResult, getEventStatus, EVENT_STATUS_INFO } from '@/lib/accessUtils';
import { canAccessZone } from '@/lib/accessZones';
import { CheckCircle2, XCircle, ArrowLeft, ScanLine } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

const ZONES = [
  { value: 'general', label: 'General' },
  { value: 'backstage', label: 'Backstage' },
  { value: 'technical', label: 'Técnica' },
  { value: 'vip', label: 'VIP' },
  { value: 'all-access', label: 'All Access' },
];

export default function AccessQrStation({ mode = 'person' }) {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [zone, setZone] = useState('');
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    base44.entities.Event.filter({ status: 'active' }, '-created_date', 50).then(setEvents).catch(() => {});
  }, []);

  const startScanner = async () => {
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScan(decodedText),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setResult({ ok: false, message: 'No se pudo acceder a la cámara.' });
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScan = async (decodedText) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => { cooldownRef.current = false; }, 3000);

    if (mode === 'vehicle') {
      await processVehicleAccess(decodedText);
    } else {
      await processPersonAccess(decodedText);
    }
  };

  const processPersonAccess = async (badgeCode) => {
    try {
      const accrs = await base44.entities.Accreditation.filter({ badge_code: badgeCode }, '-created_date', 5);
      const accreditation = accrs[0];
      if (!accreditation) {
        setResult({ ok: false, message: 'Credencial no encontrada', code: badgeCode });
        speakResult(false);
        logAccess(badgeCode, 'denied', 'Credencial no encontrada');
        return;
      }
      if (accreditation.status !== 'active') {
        setResult({ ok: false, message: 'Acreditación bloqueada', name: accreditation.person_name });
        speakResult(false);
        logAccess(badgeCode, 'denied', 'Acreditación ' + accreditation.status);
        return;
      }
      if (zone && !canAccessZone(accreditation.access_level, zone)) {
        setResult({ ok: false, message: 'Zona no autorizada', name: accreditation.person_name });
        speakResult(false);
        logAccess(badgeCode, 'denied', 'Zona no autorizada');
        return;
      }
      if (!isWithinEventPhases(selectedEvent, accreditation.event_phases)) {
        setResult({ ok: false, message: 'Fuera de rango horario', name: accreditation.person_name });
        speakResult(false);
        logAccess(badgeCode, 'denied', 'Fuera de fase');
        return;
      }
      setResult({ ok: true, message: 'Acceso permitido', name: accreditation.person_name, area: accreditation.access_level });
      speakResult(true);
      logAccess(badgeCode, 'granted');
    } catch {
      setResult({ ok: false, message: 'Error al validar' });
      speakResult(false);
    }
  };

  const processVehicleAccess = async (plate) => {
    try {
      const vehicles = await base44.entities.Vehicle.filter({ plate }, '-created_date', 5);
      const vehicle = vehicles[0];
      if (!vehicle) {
        setResult({ ok: false, message: 'Vehículo no encontrado', code: plate });
        speakResult(false);
        logAccessVehicle(plate, 'denied', 'Vehículo no encontrado');
        return;
      }
      if (vehicle.status !== 'approved') {
        setResult({ ok: false, message: 'Vehículo no autorizado', name: vehicle.person_name });
        speakResult(false);
        logAccessVehicle(plate, 'denied', 'Vehículo ' + vehicle.status);
        return;
      }
      setResult({ ok: true, message: 'Acceso permitido', name: vehicle.person_name, area: vehicle.parking_sector });
      speakResult(true);
      logAccessVehicle(plate, 'granted');
    } catch {
      setResult({ ok: false, message: 'Error al validar' });
      speakResult(false);
    }
  };

  const logAccess = async (badgeCode, result, detail = '') => {
    try {
      await base44.entities.AccessLog.create({
        accreditation_id: '',
        badge_code: badgeCode,
        event_id: selectedEvent.id,
        event_name: selectedEvent.name,
        company: selectedEvent.company,
        method: 'manual',
        resource_type: 'person',
        zone: zone || '',
        result,
      });
    } catch {}
  };

  const logAccessVehicle = async (plate, result, detail = '') => {
    try {
      await base44.entities.AccessLog.create({
        accreditation_id: '',
        badge_code: plate,
        event_id: selectedEvent.id,
        event_name: selectedEvent.name,
        company: selectedEvent.company,
        method: 'manual',
        resource_type: 'vehicle',
        zone: zone || '',
        result,
      });
    } catch {}
  };

  useEffect(() => () => stopScanner(), []);

  if (!selectedEvent) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {mode === 'vehicle' ? 'Control vehicular — QR' : 'Control de acceso — QR'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Seleccioná el evento para iniciar.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((ev) => {
            const status = getEventStatus(ev);
            const info = EVENT_STATUS_INFO[status];
            return (
              <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                <p className="font-bold text-slate-900">{ev.name}</p>
                <p className="mt-1 text-xs text-slate-400">{ev.venue || 'Sin sede'}</p>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${info.cls}`}>{info.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950">
      {result && (
        <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600/95' : 'bg-red-600/95'}`}>
          {result.ok ? <CheckCircle2 className="h-32 w-32 text-white" /> : <XCircle className="h-32 w-32 text-white" />}
          <p className="mt-6 text-4xl font-extrabold text-white">{result.message}</p>
          {result.name && <p className="mt-2 text-xl text-white/80">{result.name}</p>}
          {result.area && <p className="mt-1 text-lg text-white/60">Sector: {result.area}</p>}
          {result.code && <p className="mt-1 text-sm font-mono text-white/40">{result.code}</p>}
        </div>
      )}
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4">
          <button onClick={() => { stopScanner(); setSelectedEvent(null); setResult(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
            <ArrowLeft className="h-4 w-4" /> Cambiar evento
          </button>
          <div className="text-center">
            <p className="font-bold text-white">{selectedEvent.name}</p>
            <p className="text-xs text-slate-400">{mode === 'vehicle' ? 'Control vehicular' : 'Control de personas'}</p>
          </div>
          <select value={zone} onChange={(e) => setZone(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none">
            <option value="">Todas las zonas</option>
            {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </div>
        <div className="relative flex-1 flex items-center justify-center">
          <div id="qr-reader" className="w-full max-w-md" />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80">
              <ScanLine className="h-16 w-16 text-slate-400" />
              <p className="mt-4 text-sm text-slate-300">Escáner QR listo</p>
              <button onClick={startScanner}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700">
                <ScanLine className="h-5 w-5" /> Iniciar escaneo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}