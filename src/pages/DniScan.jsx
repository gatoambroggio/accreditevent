import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, ScanLine, RefreshCw, User, Hash, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Image as UIImage } from '@/components/ui/image';
import * as faceapi from '@vladmandic/face-api';
import { loadModels } from '@/lib/faceRecognition';

export default function DniScan() {
  const [dniFile, setDniFile] = useState(null);
  const [dniUrl, setDniUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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
          // La cara del DNI es muy chica; la detección por defecto no la pega.
          // Bajamos el tamaño mínimo de cara y el umbral de score para detectarla.
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minFaceSize: 40, scoreThreshold: 0.3 }))
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
          return faceUrl;
        })(),
      ]);

      if (ocrResult.status === 'rejected') {
        throw new Error('No se pudo realizar el OCR del DNI.');
      }

      const ocr = ocrResult.value?.data ?? ocrResult.value ?? {};
      setResult({
        nombre: ocr.nombre || '',
        apellido: ocr.apellido || '',
        dni: ocr.dni || '',
        faceUrl: faceResult.status === 'fulfilled' ? faceResult.value : null,
        faceError: faceResult.status === 'rejected' ? faceResult.reason?.message : null,
      });
    } catch (err) {
      setError(err.message || 'Error al escanear el DNI.');
    } finally {
      setScanning(false);
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
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Módulo de prueba</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Escaneo de DNI</h1>
        <p className="mt-1 text-sm text-slate-500">Subí una foto del DNI para extraer nombre, apellido, número y foto por OCR.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload / Preview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Imagen del DNI</h2>
          {dniUrl ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <img src={dniUrl} alt="DNI" className="w-full" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
                  {scanning ? 'Escaneando…' : 'Escanear DNI'}
                </button>
                <button
                  onClick={reset}
                  disabled={scanning}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-5 w-5" /> Otra
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50"
            >
              <Upload className="h-8 w-8" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">Subir imagen del DNI</p>
                <p className="text-xs text-slate-400">JPG, PNG · Frente del documento</p>
              </div>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {/* Results */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Datos extraídos</h2>
          {scanning ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <span className="mt-3 text-sm text-slate-500">Procesando DNI…</span>
            </div>
          ) : result ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><User className="h-3 w-3" /> Nombre</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{result.nombre || '—'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><User className="h-3 w-3" /> Apellido</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{result.apellido || '—'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Hash className="h-3 w-3" /> N° de DNI</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900">{result.dni || '—'}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><ImageIcon className="h-3 w-3" /> Foto extraída</p>
                {result.faceUrl ? (
                  <div className="h-40 w-32 overflow-hidden rounded-lg border border-slate-200">
                    <UIImage src={result.faceUrl} fittingType="fit" className="h-full w-full" alt="Foto del DNI" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
                    <AlertCircle className="h-4 w-4" />
                    {result.faceError || 'No se pudo extraer la foto del DNI.'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScanLine className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-400">Los datos extraídos aparecerán aquí.</p>
            </div>
          )}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}