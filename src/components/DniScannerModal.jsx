import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, ScanLine, X, Check, AlertCircle } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import { loadModels } from '@/lib/faceRecognition';

export default function DniScannerModal({ open, onClose, onScanned }) {
  const [dniFile, setDniFile] = useState(null);
  const [dniUrl, setDniUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDniFile(null);
      setDniUrl(null);
      setScanning(false);
      setResult(null);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleFile = (file) => {
    setError('');
    setResult(null);
    setDniFile(file);
    setDniUrl(URL.createObjectURL(file));
  };

  const handleScan = async () => {
    if (!dniFile) return;
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const { file_url: dniImageUrl } = await base44.integrations.Core.UploadFile({ file: dniFile });

      const [ocrResult, faceResult] = await Promise.allSettled([
        base44.functions.invoke('readDni', { file_url: dniImageUrl }),
        (async () => {
          const img = document.createElement('img');
          img.src = dniUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
          });
          await loadModels();
          const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (!detection) throw new Error('No se detectó un rostro en el DNI.');
          const box = detection.detection.box;
          const padding = Math.max(box.width, box.height) * 0.4;
          const x = Math.max(0, box.x - padding);
          const y = Math.max(0, box.y - padding);
          const w = Math.min(img.naturalWidth - x, box.width + padding * 2);
          const h = Math.min(img.naturalHeight - y, box.height + padding * 2);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
          const faceBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
          const faceFile = new File([faceBlob], 'dni-face.jpg', { type: 'image/jpeg' });
          const { file_url: faceUrl } = await base44.integrations.Core.UploadFile({ file: faceFile });
          return { faceUrl, descriptor: Array.from(detection.descriptor) };
        })(),
      ]);

      if (ocrResult.status === 'rejected') {
        throw new Error(ocrResult.reason?.message || 'No se pudo realizar el OCR del DNI.');
      }

      const ocr = ocrResult.value?.data ?? ocrResult.value ?? {};
      const face = faceResult.status === 'fulfilled' ? faceResult.value : null;

      setResult({
        nombre: ocr.nombre || '',
        apellido: ocr.apellido || '',
        dni: ocr.dni || '',
        faceUrl: face?.faceUrl || null,
        faceDescriptor: face?.descriptor || null,
        faceError: faceResult.status === 'rejected' ? faceResult.reason?.message : null,
      });
    } catch (err) {
      setError(err.message || 'Error al escanear el DNI.');
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = () => {
    if (result) {
      onScanned(result);
      onClose();
    }
  };

  const reset = () => {
    setDniFile(null);
    setDniUrl(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="allow-lowercase fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Escaneo de DNI</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Extraer datos del DNI</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Upload / Preview */}
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-900">Imagen del DNI</h3>
              {dniUrl ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <img src={dniUrl} alt="DNI" className="w-full" />
                  </div>
                  {!result && !scanning && (
                    <div className="flex gap-2">
                      <button onClick={handleScan} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
                        <ScanLine className="h-4 w-4" /> Escanear
                      </button>
                      <button onClick={reset} className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  <Upload className="h-6 w-6" />
                  <p className="text-xs font-bold text-slate-700">Subir imagen del DNI</p>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {/* Results */}
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-900">Datos extraídos</h3>
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <span className="mt-2 text-xs text-slate-500">Procesando…</span>
                </div>
              ) : result ? (
                <div className="space-y-2.5">
                  {[
                    { key: 'apellido', label: 'Apellido' },
                    { key: 'nombre', label: 'Nombre' },
                    { key: 'dni', label: 'N° de DNI', mono: true },
                  ].map((f) => (
                    <div key={f.key} className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-xs font-semibold text-slate-500">{f.label}</p>
                      <input
                        type="text"
                        value={result[f.key] || ''}
                        onChange={(e) => setResult((r) => ({ ...r, [f.key]: e.target.value }))}
                        className={`w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${f.mono ? 'font-mono' : ''}`}
                      />
                    </div>
                  ))}
                  <div>
                    <p className="mb-1 text-xs font-semibold text-slate-500">Foto</p>
                    {result.faceUrl ? (
                      <img src={result.faceUrl} alt="Foto" className="h-24 w-20 rounded-lg border border-slate-200 object-cover" />
                    ) : (
                      <p className="text-xs text-amber-600">{result.faceError || 'No se pudo extraer la foto.'}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ScanLine className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-400">Los datos aparecerán aquí.</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={reset} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Escanear otro
              </button>
              <button onClick={handleConfirm} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                <Check className="h-4 w-4" /> Usar datos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}