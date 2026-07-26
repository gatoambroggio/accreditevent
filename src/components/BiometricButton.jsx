import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function BiometricButton({ accreditation, onRegistered }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('Tu navegador no soporta autenticación biométrica.');
      }
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        throw new Error('Tu dispositivo no tiene un autenticador biométrico disponible.');
      }

      const beginRes = await base44.functions.invoke('webauthnRegister', {
        step: 'begin',
        accreditation_id: accreditation.id,
        person_id: accreditation.person_id,
        person_name: accreditation.person_name,
        origin: window.location.origin,
      });

      const attestationResponse = await startRegistration({
        optionsJSON: beginRes.data.options,
      });

      await base44.functions.invoke('webauthnRegister', {
        step: 'finish',
        biometric_id: beginRes.data.biometric_id,
        attestation_response: attestationResponse,
      });

      onRegistered();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Cancelaste el registro biométrico.');
      } else {
        setError(err.message || 'No se pudo registrar la biometría.');
      }
    } finally {
      setLoading(false);
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
    <div className="flex items-center gap-2">
      <button
        onClick={handleRegister}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
        {loading ? 'Registrando…' : 'Registrar'}
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3" />
        </span>
      )}
    </div>
  );
}