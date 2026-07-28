import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { UserPlus, CheckCircle2, Loader2 } from 'lucide-react';

export default function ProviderRegister() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ full_name: '', document: '', phone: '', email: '', company: '' });
  const [otp, setOtp] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (eventId) {
      base44.entities.Event.get(eventId).then(setEvent).catch(() => {});
    }
  }, [eventId]);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const sendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setSentOtp(code);
      await base44.integrations.Core.SendEmail({
        to: form.email,
        subject: 'Código de verificación',
        body: `Tu código de verificación es: <strong>${code}</strong>`,
      });
      setStep(2);
    } catch {
      setError('No se pudo enviar el código. Verificá tu email.');
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp !== sentOtp) {
      setError('Código incorrecto.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await base44.entities.Person.create({
        ...form,
        phone: form.phone.startsWith('54') ? form.phone : '54' + form.phone,
        person_type: 'provider',
        access_area: 'general',
        status: 'pending',
        event_id: eventId || '',
        event_ids: eventId ? [eventId] : [],
        event_names: event?.name ? [event.name] : [],
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'No se pudo registrar.');
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">¡Registro exitoso!</h1>
          <p className="mt-2 text-sm text-slate-500">Tu solicitud fue enviada. La productora revisará tu registro y te contactará.</p>
          <button onClick={() => navigate('/login')} className="mt-6 rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 mb-4">
            <UserPlus className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Registro de proveedor</h1>
          {event && <p className="mt-1 text-sm text-slate-500">Evento: {event.name}</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {step === 1 && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre completo *</span>
                <input type="text" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">DNI</span>
                <input type="text" inputMode="numeric" value={form.document} onChange={(e) => setField('document', e.target.value.replace(/\D/g, ''))} maxLength={8}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Empresa</span>
                <input type="text" value={form.company} onChange={(e) => setField('company', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono</span>
                <input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email *</span>
                <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <button onClick={sendOtp} disabled={loading || !form.full_name || !form.email}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {loading ? 'Enviando…' : 'Enviar código de verificación'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Ingresá el código de 6 dígitos que enviamos a <strong>{form.email}</strong></p>
              <input type="text" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} maxLength={6}
                className="w-full rounded-lg border border-slate-200 px-3 py-3 text-center text-2xl font-bold tracking-widest outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              <button onClick={verifyOtp} disabled={loading || otp.length !== 6}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {loading ? 'Verificando…' : 'Verificar y registrar'}
              </button>
              <button onClick={() => setStep(1)} className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700">
                ← Volver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}