import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import AuthLayout from '@/components/AuthLayout';
import { Building2, Mail, Lock, Loader2, AlertCircle, Phone, FileText } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function EmpresaRegister() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    company_name: '',
    description: '',
    contact_phone: '',
    contact_email: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.company_name.trim()) {
      setError('El nombre de la empresa es obligatorio.');
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
      try {
        await base44.auth.register({ email: form.email, password: form.password });
        setStep(2);
      } catch (regErr) {
        const msg = (regErr.message || '').toLowerCase();
        if (msg.includes('already exists')) {
          await base44.auth.loginViaEmailPassword(form.email, form.password);
          await base44.functions.invoke('empresaSetup', {
            company_name: form.company_name,
            description: form.description,
            contact_phone: form.contact_phone,
            contact_email: form.contact_email || form.email,
          });
          window.location.href = '/empresa-portal';
        } else {
          throw regErr;
        }
      }
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already exists')) {
        setError('Ya tenés una cuenta con este email. Iniciá sesión con tu contraseña anterior.');
      } else {
        setError(err.message || 'No se pudo registrar.');
      }
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
      await base44.functions.invoke('empresaSetup', {
        company_name: form.company_name,
        description: form.description,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email || form.email,
      });
      window.location.href = '/empresa-portal';
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

  if (step === 2) {
    return (
      <AuthLayout icon={Mail} title="Verificá tu email" subtitle={`Enviamos un código a ${form.email}`}>
        {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
            <InputOTPGroup>
              <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
              <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="w-full h-12 font-medium" onClick={handleVerifyOtp} disabled={loading || otpCode.length < 6}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando…</> : 'Verificar código'}
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          ¿No recibiste el código?{' '}
          <button onClick={handleResend} className="text-primary font-medium hover:underline">Reenviar</button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Building2}
      title="Registro de empresa"
      subtitle="Creá la cuenta de tu empresa para gestionar empleados y acreditaciones"
      footer={<>¿Ya tenés cuenta? <Link to="/login" className="text-primary font-medium hover:underline">Iniciar sesión</Link></>}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="company_name">Nombre de la empresa *</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="company_name" autoFocus placeholder="Ej: Audiovisuales del Sur SA"
              value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descripción / Rubro</Label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="description" placeholder="Ej: Proveedor de sonido e iluminación"
              value={form.description} onChange={(e) => setField('description', e.target.value)} className="pl-10 h-12" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact_phone">Teléfono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="contact_phone" type="tel" placeholder="11 12345678"
                value={form.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} className="pl-10 h-12" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_email">Email de contacto</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="contact_email" type="email" placeholder="contacto@empresa.com"
                value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} className="pl-10 h-12" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email de acceso *</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" autoComplete="email" placeholder="vos@empresa.com"
              value={form.email} onChange={(e) => setField('email', e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="password" type="password" autoComplete="new-password" placeholder="••••••••"
                value={form.password} onChange={(e) => setField('password', e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••"
                value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creando cuenta…</> : 'Registrarme'}
        </Button>
      </form>
    </AuthLayout>
  );
}