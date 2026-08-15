import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2, X } from 'lucide-react';

export default function QrScanner({ onDetected, paused }) {
  const containerId = 'qr-reader-container';
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';

        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.3333 },
          (decodedText) => {
            if (paused) return;
            onDetected(decodedText);
          },
          () => {}
        );
        if (mounted) setStarting(false);
      } catch (err) {
        if (mounted) {
          setError('No se pudo acceder a la cámara. Verificá los permisos.');
          setStarting(false);
        }
      }
    };

    start();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {});
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
        <div id={containerId} className="aspect-[4/3] w-full" />
        {/* Scan overlay frame */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="mt-2 text-sm">Iniciando cámara…</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
          <X className="h-4 w-4" /> {error}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Camera className="h-4 w-4 text-emerald-600" />
          Enfocá el código QR de la credencial para validar el ingreso.
        </div>
      )}
    </div>
  );
}