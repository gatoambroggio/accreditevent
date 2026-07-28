import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';

export default function EmpresaRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '', contact_phone: '', contact_email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Create provider company
      await base44.entities.ProviderCompany.create({
        ...form,
        contact_phone: form.contact_phone.startsWith('54') ? form.contact_phone : '54' + form.contact_phone,
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
          <p className="mt-2 text-sm text-slate-500">Tu empresa fue registrada. La productora revisará tu solicitud y te contactará para asignarte eventos.</p>
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
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Registro de empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Registrate como empresa proveedora de servicios</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre de la empresa *</span>
            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} required
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Rubro / Descripción</span>
            <textarea rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono de contacto</span>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600">+54</span>
              <input type="tel" value={form.contact_phone.startsWith('54') ? form.contact_phone.slice(2) : form.contact_phone}
                onChange={(e) => setField('contact_phone', e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-r-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email de contacto *</span>
            <input type="email" value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} required
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
          </label>
          <button type="submit" disabled={loading || !form.name || !form.contact_email}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : 'Registrar empresa'}
          </button>
        </form>
      </div>
    </div>
  );
}