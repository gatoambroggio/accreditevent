import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Check, Loader2, X, AlertCircle, SwitchCamera } from 'lucide-react';
import { getFaceDescriptor, loadModels } from '@/lib/faceRecognition';

export default function FaceCapture({ onCaptured, disabled, label = 'Abrir cámara', autoCapture = false }) {
  const [stream, setStream] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [faceDetected, setFaceDetected] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [facingMode, setFacingMode] = useState(() => {
    try { return localStorage.getItem('facecam_facing') || 'user'; } catch { return 'user'; }
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const descriptorRef = useRef(null);

  // Pre-load face-api models on mount
  useEffect(() => {
    let mounted = true;
    setModelsLoading(true);
    setModelsError('');
    loadModels()
      .then(() => { if (mounted) setModelsLoading(false); })
      .catch((err) => {
        if (mounted) {
          setModelsLoading(false);
          setModelsError('No se pudieron cargar los modelos de reconocimiento facial. Verificá tu conexión a internet.');
        }
      });
    return () => { mounted = false; };
  }, []);

  const stopCamera = useCallback(() => {
    setStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const startCamera = async (mode = facingMode) => {
    setError('');
    setStarting(true);
    setPhotoUrl(null);
    setPhotoFile(null);
    setFaceDetected(true);
    descriptorRef.current = null;
    stopCamera();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(s);
    } catch (err) {
      setError('No se pudo acceder a la cámara. Verificá los permisos del navegador.');
    } finally {
      setStarting(false);
    }
  };

  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    try { localStorage.setItem('facecam_facing', next); } catch {}
    await startCamera(next);
  };

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      setStream((prev) => {
        if (prev) prev.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  // Auto mode: start camera on mount
  useEffect(() => {
    if (autoCapture) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto mode: capture after 3s when stream is ready
  useEffect(() => {
    if (autoCapture && stream) {
      const timer = setTimeout(() => capture(), 3000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, stream]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setDetecting(true);

    canvas.toBlob(async (blob) => {
      if (!blob) { setDetecting(false); return; }
      const file = new File([blob], 'face-capture.jpg', { type: 'image/jpeg' });
      setPhotoUrl(URL.createObjectURL(file));
      setPhotoFile(file);
      stopCamera();

      // Extract face descriptor using face-api.js
      try {
        const descriptor = await getFaceDescriptor(canvas);
        descriptorRef.current = descriptor;
        setFaceDetected(!!descriptor);

        if (autoCapture) {
          onCaptured(file, descriptor);
        }
      } catch (err) {
        descriptorRef.current = null;
        setFaceDetected(false);
        setModelsError('Error al procesar el rostro. Probá nuevamente o en un lugar con mejor iluminación.');
        if (autoCapture) {
          onCaptured(file, null);
        }
      } finally {
        setDetecting(false);
      }
    }, 'image/jpeg', 0.85);
  };

  const retake = () => {
    setPhotoUrl(null);
    setPhotoFile(null);
    setFaceDetected(true);
    descriptorRef.current = null;
    startCamera();
  };

  const confirm = () => {
    if (photoFile) {
      onCaptured(photoFile, descriptorRef.current);
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} className="hidden" />

      {detecting && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <span className="mt-3 text-sm text-slate-500">Analizando rostro…</span>
        </div>
      )}

      {stream && !photoUrl && !detecting && (
        <>
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-36 rounded-full border-2 border-white/40" />
            </div>
            <button
              onClick={switchCamera}
              disabled={disabled || starting}
              className="absolute right-3 top-3 rounded-lg bg-black/50 p-2 text-white transition hover:bg-black/70 disabled:opacity-50"
              title="Cambiar cámara"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          </div>
          {autoCapture ? (
            <p className="mt-3 text-center text-sm text-slate-500">Capturando automáticamente…</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={capture} disabled={disabled}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                <Camera className="h-5 w-5" /> Capturar
              </button>
              <button onClick={stopCamera}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </>
      )}

      {photoUrl && !detecting && (
        <>
          <div className="overflow-hidden rounded-xl bg-slate-100">
            <img src={photoUrl} alt="Captura de rostro" className="w-full" />
          </div>
          {!faceDetected && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No se detectó un rostro humano. Probá de nuevo.</span>
            </div>
          )}
          {!autoCapture && (
            <div className="mt-3 flex gap-2">
              <button onClick={confirm} disabled={disabled}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                <Check className="h-5 w-5" /> Confirmar
              </button>
              <button onClick={retake} disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                <RefreshCw className="h-5 w-5" /> Otra
              </button>
            </div>
          )}
        </>
      )}

      {!stream && !photoUrl && !detecting && (
        autoCapture ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="mt-2 text-sm text-slate-500">Iniciando cámara…</span>
          </div>
        ) : (
          <button onClick={startCamera} disabled={disabled || starting || modelsLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-bold text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50">
            {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {starting ? 'Iniciando cámara…' : modelsLoading ? 'Cargando modelos de reconocimiento…' : label}
          </button>
        )
      )}

      {modelsLoading && !stream && !photoUrl && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando modelos de reconocimiento facial…
        </div>
      )}

      {modelsError && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{modelsError}</span>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}