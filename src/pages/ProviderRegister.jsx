import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import AuthLayout from '@/components/AuthLayout';
import FaceCapture from '@/components/FaceCapture';
import {
  UserPlus,
  Mail,
  Lock,
  Loader2,
  Camera,
  Building2,
  Phone,
  IdCard,
  ArrowRight,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function ProviderRegister() {
  const { company } = useParams();
  const [step, setStep] = useState(1);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    document: '',
    company: '',
    phone: '',
    event_id: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [personId, setPersonId] = useState(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    (async () => {
      if (!company) { setLoadingEvents(false); return; }
      try {
        const res = await base44.functions.invoke('getCompanyEvents', { company });
        setEvents(res.data?.events || []);
        setCompanyName(res.data?.company_name || company);
      } catch {}
      setLoadingEvents(false);
    })();
  }, [company]);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.event_id) {
      setError('Seleccioná el evento al que te querés inscribir.');
      return;
    }
    if (!/^\d{7,8}$/.test(form.document)) {
      setError('El documento debe tener 7 u 8 dígitos numéricos.');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 12) {
      setError('El teléfono está incompleto. Ingresá código de área sin 0 y número sin 15.');
      return;
    }
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
        event_id: form.event_id,
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

  const handleFaceCapture = async (file, descriptor) => {
    setError('');
    setSaving(true);
    try {
      let file_url;
      try {
        const uploadRes = await base44.integrations.Core.UploadFile({ file });
        file_url = uploadRes.file_url;
      } catch (uploadErr) {
        setError('No se pudo subir la foto. Verificá tu conexión a internet e intentá de nuevo.');
        return;
      }

      await base44.functions.invoke('saveProviderBiometric', {
        person_id: personId,
        person_name: form.full_name,
        event_id: form.event_id,
        face_photo_url: file_url,
        face_descriptor: descriptor || [],
      });
      toast({
        title: descriptor ? '¡Rostro registrado!' : 'Foto guardada',
        description: descriptor ? 'Ya podés ingresar al portal.' : 'Tu foto se guardó. Un administrador revisará tu biometría.',
      });
      window.location.href = '/portal';
    } catch (err) {
      setError(err.message || 'No se pudo guardar el rostro. Intentá de nuevo.');
    } finally {
      setSaving(false);
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

  // Step 3: Face capture
  if (step === 3) {
    return (
      <AuthLayout
        icon={Camera}
        title="Registrá tu rostro"
        subtitle="Capturá una foto para tu acreditación"
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {saving ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Guardando rostro…</span>
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              Tu foto se usará para validar tu identidad en el ingreso a eventos.
            </p>
            <FaceCapture onCaptured={handleFaceCapture} />
            <button
              className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                window.location.href = '/portal';
              }}
            >
              Registrar más tarde <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </>
        )}
      </AuthLayout>
    );
  }

  // Step 1: Details
  return (
    <AuthLayout
      icon={UserPlus}
      title="Registro de proveedor"
      subtitle={companyName ? `Inscripción para ${companyName}` : 'Creá tu cuenta para gestionar acreditaciones'}
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

      {loadingEvents ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <div className="mb-4 p-4 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>No hay eventos disponibles para esta productora. Contactate con el organizador.</span>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event_id">Evento</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                id="event_id"
                value={form.event_id}
                onChange={(e) => setField('event_id', e.target.value)}
                className="w-full pl-10 h-12 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="">Seleccionar evento…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          </div>

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
                  type="text"
                  inputMode="numeric"
                  placeholder="12345678"
                  value={form.document}
                  onChange={(e) => setField('document', e.target.value.replace(/\D/g, ''))}
                  className="pl-10 h-12"
                  maxLength={8}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 h-12 text-sm font-semibold text-muted-foreground">+54</span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="11 12345678"
                  value={form.phone.startsWith('54') ? form.phone.slice(2) : form.phone}
                  onChange={(e) => {
                    let cleaned = e.target.value.replace(/\D/g, '');
                    if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                    if (cleaned.startsWith('15')) cleaned = cleaned.slice(2);
                    setField('phone', '54' + cleaned);
                  }}
                  className="rounded-l-none h-12"
                  required
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
                placeholder="Nombre de tu empresa"
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
      )}
    </AuthLayout>
  );
}