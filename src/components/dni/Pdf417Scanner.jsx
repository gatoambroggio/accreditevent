import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { parsePdf417 } from '@/lib/pdf417Parser';
import { Camera, Image as ImageIcon, Loader2, ScanLine, X, Check, AlertCircle, RefreshCw, Copy, Hash, User, Calendar, CreditCard } from 'lucide-react';

const FILE_REGION_ID = 'pdf417-file-region';

export default function Pdf417Scanner({ onScanned }) {
  const [tab, setTab] = useState('camera');
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [scanningFile, setScanningFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [supported, setSupported] = useState(null); // null=checking, true, false
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const detectorRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!('BarcodeDetector' in window)) { alive && setSupported(false); return; }
        const formats = await window.BarcodeDetector.getSupportedFormats();
        alive && setSupported(formats.includes('pdf417'));
      } catch { alive && setSupported(false); }
    })();
    return () => { stopCamera(); };
  }, []);

  const stopCamera = () => {
    runningRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setCameraOn(false);
  };

  const onDecode = (text) => {
    const parsed = parsePdf417(text);
    if (parsed && parsed.dni) { stopCamera(); setResult(parsed); }
  };

  // ---- BarcodeDetector nativo (preferido) ----
  const getDetector = () => {
    if (!detectorRef.current) detectorRef.current = new window.BarcodeDetector({ formats: ['pdf417'] });
    return detectorRef.current;
  };

  const scanLoop = async () => {
    if (!runningRef.current) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2) {
      try {
        const codes = await getDetector().detect(v);
        if (codes && codes.length) { onDecode(codes[0].rawValue); return; }
      } catch {}
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const startCameraNative = async () => {
    setStarting(true);
    const cfg = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia(cfg);
    } catch {
      // Sin cámara trasera (desktop): reintento con la primera cámara disponible.
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e) {
        setError('No se pudo acceder a la cámara. Probá subir la imagen del reverso desde la pestaña "Imagen". ' + (e?.message || ''));
        setStarting(false);
        return;
      }
    }
    const v = videoRef.current;
    v.srcObject = streamRef.current;
    await v.play().catch(() => {});
    runningRef.current = true;
    setCameraOn(true);
    setStarting(false);
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const handleFileNative = async (file) => {
    setScanningFile(true);
    try {
      const bitmap = await window.createImageBitmap(file);
      const codes = await getDetector().detect(bitmap);
      bitmap.close?.();
      if (!codes || !codes.length) throw new Error('No se reconoció el código PDF417 del DNI.');
      onDecode(codes[0].rawValue);
    } catch (e) {
      setError('No se pudo decodificar el PDF417. Usá una foto nítida del reverso, bien iluminada y sin reflejos. ' + (e?.message || ''));
    } finally {
      setScanningFile(false);
    }
  };

  // ---- Fallback html5-qrcode (sin BarcodeDetector) ----
  const startCameraFallback = async () => {
    setStarting(true);
    const cfg = { fps: 10, qrbox: { width: 300, height: 150 }, aspectRatio: 2.0 };
    const make = () => new Html5Qrcode('pdf417-cam-fallback', { formatsToSupport: [Html5QrcodeSupportedFormats.PDF_417], verbose: false });
    try {
      const html5 = make();
      await html5.start({ facingMode: { ideal: 'environment' } }, cfg, onDecode, () => {});
      setCameraOn(true);
    } catch (e) {
      try {
        const cams = await Html5Qrcode.getCameras();
        if (cams && cams.length) { const html5 = make(); await html5.start(cams[0].id, cfg, onDecode, () => {}); setCameraOn(true); return; }
      } catch {}
      setError('No se pudo acceder a la cámara. Probá subir la imagen del reverso desde la pestaña "Imagen". ' + (e?.message || ''));
    } finally {
      setStarting(false);
    }
  };
  const stopCameraFallback = async () => {
    try { const h = Html5Qrcode; /* instancia administrada por lib */ } catch {}
    setCameraOn(false);
  };
  const handleFileFallback = async (file) => {
    setScanningFile(true);
    try {
      const html5 = new Html5Qrcode(FILE_REGION_ID, { formatsToSupport: [Html5QrcodeSupportedFormats.PDF_417], verbose: false });
      const text = await html5.scanFile(file, false);
      const parsed = parsePdf417(text);
      if (!parsed || !parsed.dni) throw new Error('No se reconoció el código PDF417 del DNI.');
      setResult(parsed);
    } catch (e) {
      setError('No se pudo decodificar el PDF417. Usá una foto nítida del reverso, bien iluminada y sin reflejos. ' + (e?.message || ''));
    } finally {
      setScanningFile(false);
    }
  };

  const startCamera = supported ? startCameraNative : startCameraFallback;
  const stopCameraAll = supported ? stopCamera : stopCameraFallback;
  const handleFile = supported ? handleFileNative : handleFileFallback;

  const copyRaw = () => {
    if (!result?.raw) return;
    navigator.clipboard?.writeText(result.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const reset = () => { setResult(null); setFileUrl(null); setError(''); };
  const switchTab = (t) => { stopCameraAll(); setTab(t); };

  const Field = ({ icon: Icon, label, value, mono }) => (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Icon className="h-3 w-3" /> {label}</p>
      <p className={`mt-1 text-sm font-bold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Lector QR</h2>
          <p className="text-xs text-slate-500">Escaneá el código de barras del reverso del DNI y devolvé los datos del titular.</p>
        </div>
        {result ? (
          <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Otro
          </button>
        ) : (
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button onClick={() => switchTab('camera')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === 'camera' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <Camera className="mr-1 inline h-3.5 w-3.5" /> Cámara
            </button>
            <button onClick={() => switchTab('file')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${tab === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <ImageIcon className="mr-1 inline h-3.5 w-3.5" /> Imagen
            </button>
          </div>
        )}
      </div>

      {supported === false && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Este navegador no soporta detección nativa de PDF417; usando el lector de respaldo (menos confiable). Recomendá Chrome/Edge actualizado.</span>
        </div>
      )}

      {!result && tab === 'camera' && (
        <div className="space-y-3">
          {supported ? (
            <div className="overflow-hidden rounded-xl bg-slate-900" style={{ height: 300 }}>
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            </div>
          ) : (
            <div id="pdf417-cam-fallback" className="w-full overflow-hidden rounded-xl bg-slate-900" style={{ minHeight: cameraOn ? 240 : 0 }} />
          )}
          {!cameraOn ? (
            <button onClick={startCamera} disabled={starting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              {starting ? 'Iniciando cámara…' : 'Iniciar cámara'}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ScanLine className="h-4 w-4 animate-pulse" /> Enfocá el código del reverso del DNI…</span>
              <button onClick={stopCameraAll} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                <X className="h-3.5 w-3.5" /> Detener
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400">El recuadro debe abarcar el código completo. Si no hay cámara, usá la pestaña "Imagen".</p>
        </div>
      )}

      {!result && tab === 'file' && (
        <div className="space-y-3">
          <div id={FILE_REGION_ID} className="hidden" />
          {fileUrl ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <img src={fileUrl} alt="Reverso DNI" className="w-full" />
              </div>
              {scanningFile && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Decodificando PDF417…</div>
              )}
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50">
              <ImageIcon className="h-8 w-8" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Subir foto del reverso del DNI</p>
                <p className="text-xs text-slate-400">JPG, PNG · Con el código PDF417 visible</p>
              </div>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFileUrl(URL.createObjectURL(f)); handleFile(f); } }} />
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field icon={User} label="Apellido" value={result.apellido} />
            <Field icon={User} label="Nombre" value={result.nombre} />
            <Field icon={Hash} label="N° de DNI" value={result.dni} mono />
            <Field icon={User} label="Sexo" value={result.sexo_label} />
            <Field icon={User} label="Nacionalidad" value={result.nacionalidad} />
            <Field icon={Calendar} label="Fecha de nacimiento" value={result.fecha_nacimiento_fmt} />
            <Field icon={Calendar} label="Fecha de emisión" value={result.fecha_emision_fmt} />
            <Field icon={CreditCard} label="N° de trámite" value={result.tramite} mono />
          </div>
          <details className="rounded-lg bg-slate-100 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">String PDF417 decodificado</summary>
            <div className="mt-2 flex items-start gap-2">
              <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 text-[11px] text-slate-700">{result.raw}</pre>
              <button onClick={copyRaw} className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </details>
          {onScanned && (
            <button onClick={() => onScanned(result)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
              <Check className="h-4 w-4" /> Usar datos
            </button>
          )}
        </div>
      )}
    </div>
  );
}