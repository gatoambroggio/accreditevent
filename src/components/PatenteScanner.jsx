import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Loader2, Upload, Check, X, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';
import { enhanceImage } from '@/lib/ocrPreprocess';

// Lector de patentes reutilizable con captura automática en bucle.
// - Modo normal (default): detecta una patente, la muestra y detiene la cámara.
// - Modo `continuous` (estación de control): arranca la cámara solo, reporta
//   cada patente válida vía onPatente y sigue escaneando sin mostrar panel
//   propio (la estación muestra el overlay verde/rojo). Evita reportar la misma
//   patente repetidamente mientras el vehículo está quieto frente a la cámara.
export default function PatenteScanner({ onPatente, autoConfirm = true, intervalMs = 1500, continuous = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const busyRef = useRef(false);
  const lastPlateRef = useRef('');
  const lastPlateAtRef = useRef(0);
  const [streaming, setStreaming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const processBlob = async (blob) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    if (!continuous) setError('');
    try {
      // Preprocesar en el navegador (grises + contraste + upscale) antes de
      // subir: Tesseract lee mucho mejor una placa con alto contraste que la
      // foto cruda de la cámara, que es por lo que "no leía nada".
      const enhanced = await enhanceImage(blob, { grayscale: true, contrast: 1.8 });
      const file = new File([enhanced], 'patente.png', { type: 'image/png' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('readPatente', { file_url });
      const d = res?.data ?? res;
      if (d?.error) throw new Error(d.error);
      if (continuous) {
        // En estación solo reportamos patentes válidas y seguimos escaneando.
        if (d.patente && d.valido) {
          const now = Date.now();
          if (d.patente === lastPlateRef.current && now - lastPlateAtRef.current < 5000) return;
          lastPlateRef.current = d.patente;
          lastPlateAtRef.current = now;
          if (onPatente) onPatente(d.patente);
        }
        return;
      }
      // Modo normal: mostrar siempre el resultado (valido o no) para que el
      // usuario vea qué detectó Tesseract y pueda corregir a mano. Antes, si
      // la patente no calzaba el formato exacto, no se mostraba nada ("no anda").
      setResult(d);
      setManual(d.patente || '');
      stopCamera();
      if (autoConfirm && d.patente && d.valido && onPatente) onPatente(d.patente);
    } catch (e) {
      if (!continuous) setError(e.message || 'No se pudo leer la patente.');
    } finally {
      setProcessing(false);
      busyRef.current = false;
    }
  };

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    // Recortar al centro (donde está la guía): así Tesseract recibe la patente
    // grande en vez de un cuadro lejano completo, que es por lo que la cámara
    // "no leía nada" aunque la foto subida sí funcionara.
    const cw = Math.round(vw * 0.86);
    const ch = Math.round(vh * 0.38);
    const cx = Math.round((vw - cw) / 2);
    const cy = Math.round((vh - ch) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
    canvas.toBlob((blob) => blob && processBlob(blob), 'image/jpeg', 0.92);
  }, [processBlob]);

  const startCamera = useCallback(async () => {
    setError('');
    setResult(null);
    setManual('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setStreaming(true);
    } catch (e) {
      setError('No se pudo acceder a la cámara. Usá "Subir foto".');
    }
  }, []);

  // Cuando `streaming` pasa a true, el <video> ya está en el DOM: asignamos el
  // stream, reproducimos y arrancamos el bucle de captura automática.
  useEffect(() => {
    if (!streaming) return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    const startLoop = () => {
      if (loopRef.current) clearInterval(loopRef.current);
      loopRef.current = setInterval(captureFrame, intervalMs);
    };
    if (video.readyState >= 2) {
      startLoop();
    } else {
      video.addEventListener('loadeddata', startLoop, { once: true });
    }
    return () => {
      if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    };
  }, [streaming, captureFrame, intervalMs]);

  // En modo continuo, arrancar la cámara automáticamente al montar.
  useEffect(() => {
    if (continuous) startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleFile = (e) => {
    stopCamera();
    const f = e.target.files?.[0];
    if (f) processBlob(f);
  };

  const confirm = () => {
    const p = manual.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!p) {
      toast({ title: 'Patente vacía', variant: 'destructive' });
      return;
    }
    if (onPatente) onPatente(p);
    toast({ title: 'Patente confirmada', description: p });
  };

  // --- Modo continuo (estación de control) ---
  if (continuous) {
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} playsInline muted className="h-auto w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-20 w-3/4 rounded-lg border-2 border-amber-400/80 shadow-[0_0_0_2000px_rgba(15,23,42,0.25)]" />
          </div>
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-semibold text-white">
            <Camera className="h-3.5 w-3.5 text-amber-300" /> Escaneando patentes…
          </div>
          {processing && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-slate-900/60 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
              <span className="text-xs font-medium text-white">Leyendo patente…</span>
            </div>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
            <X className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
      </div>
    );
  }

  // --- Modo normal (página Patentes) ---
  return (
    <div className="space-y-4">
      {!streaming && !result && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 text-center">
          <Camera className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">La cámara escaneará la patente automáticamente</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={startCamera} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">
              <Camera className="h-4 w-4" /> Abrir cámara
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              <Upload className="h-4 w-4" /> Subir foto
              <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {streaming && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-slate-900">
            <video ref={videoRef} playsInline muted className="h-auto w-full" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-3/4 rounded-lg border-2 border-emerald-400/80 shadow-[0_0_0_2000px_rgba(15,23,42,0.25)]" />
            </div>
            {processing && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-slate-900/60 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span className="text-xs font-medium text-white">Escaneando patente…</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button onClick={stopCamera} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
              <X className="h-4 w-4" /> Cerrar cámara
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          <X className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Patente detectada</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${result.valido ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
              {result.valido ? 'VÁLIDA' : 'REVISAR'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid min-w-[140px] place-items-center rounded-md border-2 border-slate-900 bg-white px-4 py-2">
              <span className="font-mono text-2xl font-extrabold tracking-[0.15em] text-slate-900">{result.patente || '—'}</span>
              <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate-400">Argentina</span>
            </div>
            <div className="text-xs text-slate-500">
              <p className="font-semibold text-slate-700">{result.descripcion}</p>
              <p className="mt-0.5">Confianza: {Math.round((result.confianza || 0) * 100)}%</p>
              {result.formato_detectado && result.formato_detectado !== 'desconocido' && (
                <p className="mt-0.5">Modelo: {result.formato_detectado}</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Corregir manualmente</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manual}
                onChange={(e) => setManual(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="AB123CD"
                maxLength={7}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              <button onClick={confirm} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
                <Check className="h-4 w-4" /> Usar
              </button>
            </div>
          </div>

          {!result.valido && (
            <details className="rounded-lg bg-slate-100 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">Texto OCR crudo (para diagnosticar)</summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-slate-600">{result.raw_text || '(vacío — Tesseract no devolvió texto)'}</pre>
            </details>
          )}

          <button onClick={() => { setResult(null); setManual(''); startCamera(); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
            <RotateCcw className="h-3.5 w-3.5" /> Escanear otra patente
          </button>
        </div>
      )}
    </div>
  );
}