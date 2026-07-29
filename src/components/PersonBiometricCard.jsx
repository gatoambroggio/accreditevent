import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Fingerprint, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import { Image } from '@/components/ui/image';

export default function PersonBiometricCard({ person }) {
  const [biometric, setBiometric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const bios = await base44.entities.Biometric.filter(
        { person_id: person.id, status: 'active' },
        '-created_date',
        1
      );
      setBiometric(bios[0] || null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [person.id]);

  const handleCaptured = async (file, descriptor) => {
    setSaving(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Tenant-isolated save (service role, scoped to the productora's own data)
      const res = await base44.functions.invoke('saveProviderBiometric', {
        person_id: person.id,
        person_name: person.full_name,
        event_id: person.event_id || '',
        face_photo_url: file_url,
        face_descriptor: descriptor || [],
      });
      if (res?.data?.error) {
        setError(res.data.error);
        return;
      }

      const accreds = await base44.entities.Accreditation.filter({
        person_id: person.id,
        status: 'active',
      });
      if (accreds.length > 0) {
        await base44.entities.Accreditation.bulkUpdate(
          accreds.map((a) => ({ id: a.id, has_biometric: true }))
        );
      }

      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el rostro.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
        <Fingerprint className="h-4 w-4 text-emerald-600" /> Biometría
      </h3>

      {biometric && !saving && (
        <div className="mb-4 flex items-start gap-4 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          {biometric.face_photo_url && (
            <Image
              src={biometric.face_photo_url}
              alt="Rostro registrado"
              fittingType="cover"
              className="h-16 w-16 shrink-0 rounded-lg object-cover ring-2 ring-emerald-300"
            />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-800">Rostro registrado</p>
            </div>
            <p className="mt-0.5 text-xs text-emerald-600">
              {biometric.face_descriptor && biometric.face_descriptor.length > 0
                ? 'Reconocimiento facial activo. Ya podés usar la cámara para ingresar a eventos.'
                : 'Foto guardada. Pendiente activación de reconocimiento facial.'}
            </p>
          </div>
        </div>
      )}

      {!biometric && !saving && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <XCircle className="h-5 w-5 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Biometría no registrada</p>
            <p className="text-xs text-amber-600">Registrá tu rostro para usar el ingreso facial a eventos.</p>
          </div>
        </div>
      )}

      {saving ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="ml-2 text-sm text-slate-500">Guardando rostro…</span>
        </div>
      ) : (
        <FaceCapture
          onCaptured={handleCaptured}
          label={biometric ? 'Volver a registrar rostro' : 'Registrar rostro'}
        />
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}