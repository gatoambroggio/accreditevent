import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { parsePdf417 } from '@/lib/pdf417Parser';
import { Camera, Image as ImageIcon, Loader2, ScanLine, X, Check, AlertCircle, RefreshCw, Copy, Hash, User, Calendar, CreditCard } from 'lucide-react';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';

// Decodificación del PDF417 del DNI argentino.
// Camino 1: BarcodeDetector nativo del navegador (pdf417) — Chrome/Edge/Android.
//   Funciona en preview de Base44 (subir imagen) y en Ubuntu (cámara + imagen).
// Camino 2: servidor `readDniPdf417` (zbarimg en Ubuntu) — respaldo confiable y
//   air-gapped cuando el navegador no decode o no soporta pdf417 (Firefox/Safari).
export default function Pdf417Scanner({ onScanned }) {
  const [tab, setTab] = useState('camera');
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [scanningFile, setScanningFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdf417Supported, setPdf417Supported] = useState(null); // null=checking | true | false
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
        if (!('BarcodeDetector' in window)) { alive && setPdf417Supported(false); return; }
        const formats = await window.BarcodeDetector.getSupportedFormats();
        alive && setPdf417Supported(Array.isArray(formats) && formats.includes('pdf417'));
      } catch { alive && setPdf417Supported(false); }
    })();
    return () => { stopCamera(); };
  }, []);

  const stopCamera = () => {
    runningRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  const getDetector = () => {
    if (!detectorRef.current) detectorRef.current = new window.BarcodeDetector({ formats: ['pdf417'] });
    return detectorRef.current;
  };

  // ZXing: decodificador PDF417 puro JS (sin WASM). Anda en preview y Ubuntu,
  // más confiable que BarcodeDetector para el PDF417 denso del DNI argentino.
  const zxingRef = useRef(null);
  const lastZxingRef = useRef(0);
  const getZxing = () => {
    if (!zxingRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      zxingRef.current = new BrowserMultiFormatReader(hints);
    }
    return zxingRef.current;
  };
  // Decodifica cualquier source dibujable (ImageBitmap o frame de video) con ZXing,
  // probando escalado y binarización. Reutilizado por imagen subida y cámara.
  const decodeDrawableWithZxing = async (drawable, w, h) => {
    const reader = getZxing();
    const makeCanvas = (scale, binarize) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
      // Binariza a B/N puro (threshold 50%) — replica el `convert -threshold 50%`
      // del pipeline probado, ayuda a ZXing con fotos de bajo contraste.
      if (binarize) {
        const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = g < 128 ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(id, 0, 0);
      }
      return canvas;
    };
    const tryDecode = async (scale, binarize) => {
      try { const r = await reader.decodeFromCanvasElement(makeCanvas(scale, binarize)); return r?.getText() || null; } catch { return null; }
    };
    for (const [s, b] of [[1, false], [2, false], [2, true], [3, true]]) {
      const t = await tryDecode(s, b);
      if (t) return t;
    }
    return null;
  };
  const decodeWithZxing = async (bitmap) => decodeDrawableWithZxing(bitmap, bitmap.width, bitmap.height);

  // Parsea el string crudo, detiene cámara y guarda resultado. true si tenía DNI.
  const applyRaw = (raw) => {
    const parsed = parsePdf417(raw);
    if (parsed && parsed.dni) { stopCamera(); setResult(parsed); return true; }
    return false;
  };

  const scanLoop = async () => {
    if (!runningRef.current) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2) {
      // Camino 1: BarcodeDetector nativo (rápido, frame a frame).
      if (pdf417Supported) {
        try {
          const codes = await getDetector().detect(v);
          if (codes && codes.length && codes[0].rawValue && applyRaw(codes[0].rawValue)) return;
        } catch {}
      }
      // Camino 2: ZXing sobre el frame actual (mismo multi-motor que la imagen subida).
      // Throttleado a ~3/s: ZXing es pesado y decodear a 60fps congelaría la cámara.
      const now = Date.now();
      if (now - lastZxingRef.current > 300) {
        lastZxingRef.current = now;
        if (v.videoWidth > 0) {
          try {
            const raw = await decodeDrawableWithZxing(v, v.videoWidth, v.videoHeight);
            if (raw && applyRaw(raw)) return;
          } catch {}
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const startCamera = async () => {
    setStarting(true); setError('');
    const cfg = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    try { streamRef.current = await navigator.mediaDevices.getUserMedia(cfg); }
    catch {
      try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      catch (e) {
        setError('No se pudo acceder a la cámara. Subí la imagen del DNI desde la pestaña "Imagen". ' + (e?.message || ''));
        setStarting(false); return;
      }
    }
    const v = videoRef.current;
    v.srcObject = streamRef.current;
    await v.play().catch(() => {});
    runningRef.current = true; setCameraOn(true); setStarting(false);
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  // Prueba el Bitmap tal cual y, si no decode, una versión escalada 1.5x en canvas
  // (ayuda cuando el PDF417 ocupa una franja chica de la tarjeta completa).
  const detectWithBrowser = async (bitmap) => {
    const detector = getDetector();
    try { const codes = await detector.detect(bitmap); if (codes && codes.length && codes[0].rawValue) return codes[0].rawValue; } catch {}
    try {
      const scale = 1.5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const codes = await detector.detect(canvas);
      if (codes && codes.length && codes[0].rawValue) return codes[0].rawValue;
    } catch {}
    return null;
  };

  // Sube la imagen y pide al servidor (zbarimg en Ubuntu) que decode el PDF417.
  const decodeOnServer = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const res = await base44.functions.invoke('readDniPdf417', { file_url });
    const data = res?.data ?? res;
    if (!data || data.ok === false || data.error) throw new Error(data?.error || 'No se pudo decodificar en el servidor.');
    return data;
  };

  const handleFile = async (file) => {
    setScanningFile(true); setError(''); setResult(null);
    try {
      const bitmap = await window.createImageBitmap(file);
      let raw = null;
      // Camino 1: BarcodeDetector nativo (rápido, si el navegador soporta pdf417).
      if (pdf417Supported) {
        try { raw = await detectWithBrowser(bitmap); } catch {}
      }
      // Camino 2: ZXing (puro JS, confiable para PDF417 — anda en preview y Ubuntu).
      if (!raw) {
        try { raw = await decodeWithZxing(bitmap); } catch {}
      }
      bitmap.close?.();
      if (raw) {
        if (!applyRaw(raw)) throw new Error('Se decodificó un código pero no se reconocieron los datos del DNI.');
      } else {
        // Camino 3: servidor (zbarimg en Ubuntu). Respaldo confiable y air-gapped.
        const data = await decodeOnServer(file);
        if (data.parsed) { setResult(data.parsed); }
        else if (data.raw && applyRaw(data.raw)) { /* ok */ }
        else throw new Error('No se encontró el código PDF417 del DNI.');
      }
    } catch (e) {
      setError(e.message || 'No se pudo decodificar el DNI.');
    } finally {
      setScanningFile(false);
    }
  };

  const copyRaw = () => { if (result?.raw) { navigator.clipboard?.writeText(result.raw); setCopied(true); setTimeout(() => setCopied(false), 1500); } };
  const reset = () => { setResult(null); setFileUrl(null); setError(''); };
  const switchTab = (t) => { stopCamera(); setTab(t); };

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
          <h2 className="text-lg font-bold text-slate-900">Lector PDF417</h2>
          <p className="text-xs text-slate-500">Escaneá el código de barras 2D (PDF417) del DNI y devolvé los datos del titular.</p>
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

      <div className="mb-4 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-xs text-sky-800 ring-1 ring-sky-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Escaneá la cara del DNI que tenga el código de barras 2D (PDF417). Según la versión del DNI puede estar en el frente o en el dorso.</span>
      </div>

      {!result && tab === 'camera' && (
        <div className="space-y-3">
          {pdf417Supported === false ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              La cámara requiere un navegador con soporte de PDF417 (Chrome/Edge). Usá la pestaña <b>Imagen</b>.
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl bg-slate-900" style={{ height: 300 }}>
                <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              </div>
              {!cameraOn ? (
                <button onClick={startCamera} disabled={starting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                  {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  {starting ? 'Iniciando cámara…' : 'Iniciar cámara'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ScanLine className="h-4 w-4 animate-pulse" /> Enfocá el código del DNI…</span>
                  <button onClick={stopCamera} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" /> Detener
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400">El recuadro debe abarcar el código completo. Si no hay cámara, usá la pestaña "Imagen".</p>
            </>
          )}
        </div>
      )}

      {!result && tab === 'file' && (
        <div className="space-y-3">
          {fileUrl ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <img src={fileUrl} alt="DNI" className="w-full" />
              </div>
              {scanningFile && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Decodificando PDF417…</div>
              )}
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50">
              <ImageIcon className="h-8 w-8" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Subir foto del DNI</p>
                <p className="text-xs text-slate-400">JPG, PNG · La cara del DNI con el código de barras 2D (PDF417)</p>
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