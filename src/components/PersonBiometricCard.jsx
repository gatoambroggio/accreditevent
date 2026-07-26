import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function PersonBiometricCard({ person }) {
  const [biometric, setBiometric] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
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

  const handleRegister = async () => {
    setError('');
    setRegistering(true);
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
        person_id: person.id,
        person_name: person.full_name,
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

      await load();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Cancelaste el registro biométrico.');
      } else {
        setError(err.message || 'No se pudo registrar la biometría.');
      }
    } finally {
      setRegistering(false);
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

      {biometric ? (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">Rostro registrado</p>
            <p className="text-xs text-emerald-600">Ya podés usar Face ID o huella para ingresar a eventos.</p>
          </div>
          <button
            onClick={handleRegister}
            disabled={registering}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Volver a registrar
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-sm text-slate-500">
            No registraste tu biometría todavía. Registrala para agilizar tu ingreso a los eventos.
          </p>
          <button
            onClick={handleRegister}
            disabled={registering}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            {registering ? 'Registrando…' : 'Registrar rostro'}
          </button>
        </div>
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