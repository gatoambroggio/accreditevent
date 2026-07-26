import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import AuthLayout from '@/components/AuthLayout';
import {
  UserPlus,
  Mail,
  Lock,
  Loader2,
  Fingerprint,
  CheckCircle2,
  Building2,
  Phone,
  IdCard,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function ProviderRegister() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    document: '',
    company: '',
    phone: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [personId, setPersonId] = useState(null);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email: form.email, password: form.password });
      setStep(2);
    } catch (err) {
      setError(err.message || 'No se pudo registrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email: form.email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
      }
      const res = await base44.functions.invoke('providerSetup', {
        full_name: form.full_name,
        document: form.document,
        company: form.company,
        phone: form.phone,
        email: form.email,
      });
      setPersonId(res.data.person_id);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    try {
      await base44.auth.resendOtp(form.email);
      toast({ title: 'Código enviado', description: 'Revisá tu email.' });
    } catch (err) {
      setError(err.message || 'No se pudo reenviar.');
    }
  };

  const handleFaceId = async () => {
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
        person_id: personId,
        person_name: form.full_name,
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

      toast({ title: '¡Rostro registrado!', description: 'Ya podés ingresar al portal.' });
      window.location.href = '/portal';
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

  // Step 2: OTP
  if (step === 2) {
    return (
      <AuthLayout
        icon={Mail}
        title="Verificá tu email"
        subtitle={`Enviamos un código a ${form.email}`}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <div className="flex justify-center mb-6">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={setOtpCode}
            autoFocus
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerifyOtp}
          disabled={loading || otpCode.length < 6}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando…
            </>
          ) : (
            'Verificar código'
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          ¿No recibiste el código?{' '}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">
            Reenviar
          </button>
        </p>
      </AuthLayout>
    );
  }

  // Step 3: Face ID
  if (step === 3) {
    return (
      <AuthLayout
        icon={Fingerprint}
        title="Registrá tu rostro"
        subtitle="Usá Face ID o huella para tu acreditación en eventos"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Fingerprint className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Tu rostro se registrará de forma segura en tu dispositivo. Lo usaremos para validar tu
            ingreso en los eventos.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          className="w-full h-12 font-medium mb-3"
          onClick={handleFaceId}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registrando…
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4 mr-2" /> Registrar rostro con Face ID
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          className="w-full text-sm text-muted-foreground"
          onClick={() => { window.location.href = '/portal'; }}
        >
          Registrar más tarde <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </AuthLayout>
    );
  }

  // Step 1: Details
  return (
    <AuthLayout
      icon={UserPlus}
      title="Registro de proveedor"
      subtitle="Creá tu cuenta para gestionar acreditaciones"
      footer={
        <>
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Iniciar sesión
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nombre completo</Label>
          <div className="relative">
            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="full_name"
              autoComplete="name"
              autoFocus
              placeholder="Juan Pérez"
              value={form.full_name}
              onChange={(e) => setField('full_name', e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="document">Documento</Label>
            <div className="relative">
              <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="document"
                placeholder="12345678"
                value={form.document}
                onChange={(e) => setField('document', e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="+54 11…"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                className="pl-10 h-12"
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Empresa</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="company"
              placeholder="Nombre de la empresa"
              value={form.company}
              onChange={(e) => setField('company', e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="vos@empresa.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setField('confirmPassword', e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando cuenta…
            </>
          ) : (
            'Registrarme'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}