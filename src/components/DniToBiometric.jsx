import React, { useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { base44 } from '@/api/base44Client';
import { loadModels } from '@/lib/faceRecognition';
import { X, Upload, ScanFace, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function DniToBiometric({ person, onSaved, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!person) return null;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
    setSuccess(false);
  };

  const handleProcess = async () => {
    if (!file) return;
    setProcessing(true);
    setError('');
    setStatus('Cargando imagen…');
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      });

      setStatus('Cargando modelos de reconocimiento…');
      await loadModels();

      setStatus('Detectando rostro en el DNI…');
      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        URL.revokeObjectURL(url);
        throw new Error('No se detectó un rostro en la imagen. Subí una foto del DNI donde el rostro sea claramente visible.');
      }

      // Crop the face region with padding
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
      const faceFile = new File([faceBlob], `dni-face-${person.id}.jpg`, { type: 'image/jpeg' });
      URL.revokeObjectURL(url);

      setStatus('Subiendo foto del rostro…');
      const { file_url } = await base44.integrations.Core.UploadFile({ file: faceFile });

      // SECURITY: Check face duplicate on a different person before saving
      const descriptor = Array.from(detection.descriptor);
      const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
        face_descriptor: descriptor,
        person_id: person.id,
      });
      if (dupCheck.is_duplicate) {
        throw new Error(`Este rostro ya está registrado para "${dupCheck.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
      }

      setStatus('Guardando biometría…');
      const existing = await base44.entities.Biometric.filter({ person_id: person.id, status: 'active' });
      for (const b of existing) {
        await base44.entities.Biometric.update(b.id, { status: 'revoked' });
      }
      await base44.entities.Biometric.create({
        person_id: person.id,
        person_name: person.full_name,
        company: person.productora || person.company || '',
        face_photo_url: file_url,
        face_descriptor: descriptor,
        status: 'active',
      });

      // Mark accreditations as having biometric
      try {
        const accrs = await base44.entities.Accreditation.filter({ person_id: person.id });
        if (accrs.length > 0) {
          await base44.entities.Accreditation.bulkUpdate(accrs.map((a) => ({ id: a.id, has_biometric: true })));
        }
      } catch {}

      setSuccess(true);
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Error al procesar la imagen.');
    } finally {
      setProcessing(false);
      setStatus('');
    }
  };

  const handleClose = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setError('');
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <ScanFace className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">DNI → Biométrico</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{person.full_name}</h2>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="mt-3 text-lg font-bold text-slate-900">Biometría registrada</p>
              <p className="mt-1 text-sm text-slate-500">El rostro se extrajo de la foto del DNI y se guardó como biometría activa.</p>
              <button onClick={handleClose} className="mt-5 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Cerrar</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Subí una foto o escaneo del DNI. El sistema detectará el rostro automáticamente, lo recortará y lo guardará como biometría para reconocimiento facial.
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 py-8 transition hover:border-emerald-400 hover:bg-emerald-50/30">
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="text-sm font-medium text-slate-500">{file ? file.name : 'Click para subir foto del DNI'}</span>
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
              {preview && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <img src={preview} alt="DNI" className="max-h-64 w-full object-contain" />
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}
              {file && (
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                  {processing ? (status || 'Procesando…') : 'Extraer rostro y guardar'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}