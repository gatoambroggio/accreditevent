import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Camera, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';

export default function BiometricButton({ accreditation, onRegistered }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCaptured = async (file, descriptor) => {
    setSaving(true);
    setError('');
    try {
      if (!descriptor) {
        setError('No se detectó un rostro humano. Probá de nuevo.');
        return;
      }

      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // SECURITY: Check face duplicate on a different person before saving
      const dupCheck = await base44.functions.invoke('checkFaceDuplicate', {
        face_descriptor: descriptor,
        person_id: accreditation.person_id,
      });
      if (dupCheck.data?.is_duplicate) {
        setError(`Este rostro ya está registrado para "${dupCheck.data.duplicates[0].person_name}". No se puede registrar la misma cara en dos personas distintas.`);
        return;
      }

      const existing = await base44.entities.Biometric.filter({
        person_id: accreditation.person_id,
        status: 'active',
      });
      for (const b of existing) {
        await base44.entities.Biometric.update(b.id, { status: 'revoked' });
      }

      await base44.entities.Biometric.create({
        accreditation_id: accreditation.id,
        person_id: accreditation.person_id,
        person_name: accreditation.person_name,
        event_id: accreditation.event_id,
        company: accreditation.company || '',
        face_photo_url: file_url,
        face_descriptor: descriptor,
        status: 'active',
      });

      await base44.entities.Accreditation.update(accreditation.id, { has_biometric: true });
      setOpen(false);
      onRegistered();
    } catch (err) {
      setError(err.message || 'No se pudo registrar.');
    } finally {
      setSaving(false);
    }
  };

  if (accreditation.has_biometric) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> Biométrico
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        <Camera className="h-3.5 w-3.5" /> Registrar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
          <div className="my-8 w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Registrar rostro</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="mb-4 text-sm text-slate-500">
                {accreditation.person_name}
              </p>
              {saving ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <span className="ml-2 text-sm text-slate-500">Guardando…</span>
                </div>
              ) : (
                <FaceCapture onCaptured={handleCaptured} />
              )}
              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}