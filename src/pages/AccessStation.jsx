import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import { findBestMatch } from '@/lib/faceRecognition';

export default function AccessStation() {
  const [cycle, setCycle] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const speak = useCallback((text) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-AR';
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  const handleCaptured = async (file, descriptor) => {
    setVerifying(true);
    setResult(null);
    try {
      if (!descriptor) {
        setResult({ ok: false, message: 'No se detectó un rostro humano en la captura.' });
        return;
      }

      // Fetch all active biometrics with descriptors
      const bios = await base44.entities.Biometric.filter(
        { status: 'active' },
        '-created_date',
        500
      );

      const withDescriptors = bios.filter((b) => b.face_descriptor && b.face_descriptor.length > 0);
      if (withDescriptors.length === 0) {
        setResult({ ok: false, message: 'No hay rostros registrados en el sistema.' });
        return;
      }

      // Fetch all active accreditations
      const accreditations = await base44.entities.Accreditation.filter(
        { status: 'active' },
        '-created_date',
        500
      );

      // Find best match using face-api.js descriptors (real face recognition)
      const { match, distance } = findBestMatch(descriptor, withDescriptors);

      if (!match) {
        setResult({ ok: false, message: `No se encontró coincidencia facial (mejor distancia: ${distance.toFixed(2)}).` });
        return;
      }

      // Find the active accreditation for this person
      const accred = accreditations.find((a) => a.person_id === match.person_id);
      if (!accred) {
        setResult({
          ok: false,
          message: 'Persona identificada pero sin acreditación activa.',
          person_name: match.person_name,
        });
        return;
      }

      // Log the access
      const me = await base44.auth.me();
      await base44.entities.AccessLog.create({
        accreditation_id: accred.id,
        person_name: accred.person_name,
        badge_code: accred.badge_code,
        event_name: accred.event_name,
        verified_by: me?.full_name || me?.email || 'Sistema',
        method: 'biometric',
      });

      setResult({ ok: true, person_name: accred.person_name, accred });
    } catch (err) {
      setResult({ ok: false, message: err.message || 'Error en la verificación.' });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!result) return;
    speak(result.ok ? 'Aceptado' : 'Denegado');
    const timer = setTimeout(() => {
      setResult(null);
      setCycle((c) => c + 1);
    }, 5000);
    return () => clearTimeout(timer);
  }, [result, speak]);

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Estación de control</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/control-manual" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              Validación manual
            </Link>
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Panel
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-bold text-slate-900">Identificación facial automática</h2>
          <p className="mb-5 text-sm text-slate-500">
            Mirá a la cámara. El sistema te identificará automáticamente al detectar tu rostro.
          </p>

          {verifying ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
              <span className="mt-3 text-sm text-slate-500">Identificando…</span>
            </div>
          ) : !result ? (
            <FaceCapture key={cycle} onCaptured={handleCaptured} autoCapture />
          ) : null}
        </div>
      </div>

      {/* Full-screen result overlay */}
      {result && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center ${result.ok ? 'bg-emerald-600' : 'bg-red-600'}`}
          onClick={() => { setResult(null); setCycle((c) => c + 1); }}
        >
          {result.ok ? (
            <CheckCircle2 className="h-32 w-32 text-white" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-32 w-32 text-white" strokeWidth={1.5} />
          )}
          <p className="mt-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            {result.ok ? 'ACEPTADO' : 'DENEGADO'}
          </p>
          {result.person_name && (
            <p className="mt-3 text-lg text-white/80">{result.person_name}</p>
          )}
          {!result.ok && result.message && (
            <p className="mt-1 max-w-md px-6 text-center text-sm text-white/70">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}