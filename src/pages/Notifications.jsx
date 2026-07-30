import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Save, Mail, MessageSquare, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';

export default function Notifications() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        setSettings(all[0] || null);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const toggle = (key, value) => {
    setSettings((s) => ({
      ...s,
      enabled_modules: { ...(s?.enabled_modules || {}), [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const updated = await base44.entities.SystemSetting.update(settings.id, {
        enabled_modules: settings.enabled_modules,
      });
      setSettings(updated);
      setMsg('Configuración guardada correctamente.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;
  }

  const toggles = [
    {
      key: 'accreditation_email',
      label: 'Envío de mail al acreditar',
      desc: 'Envía automáticamente el mail de retiro de credencial a la persona acreditada y a la empresa proveedora al generar una acreditación.',
      icon: Mail,
    },
    {
      key: 'accreditation_whatsapp',
      label: 'Envío de WhatsApp al acreditar',
      desc: 'Abre automáticamente WhatsApp con el mensaje de retiro de credencial al generar una acreditación.',
      icon: MessageSquare,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Notificaciones" title="Envío automático">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
        </button>
      </PageHeader>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
      {msg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> {msg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Control de envíos</h2>
        <p className="mt-0.5 text-xs text-slate-500">Activá o desactivá el envío automático de mails y WhatsApp al generar acreditaciones.</p>
        <div className="mt-4 space-y-3">
          {toggles.map((t) => {
            const Icon = t.icon;
            const checked = settings.enabled_modules?.[t.key] ?? true;
            return (
              <label key={t.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{t.desc}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}