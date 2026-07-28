import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, Plus, Trash2, Building2 } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]) setSettings(all[0]);
        else setSettings({});
      } catch {}
    })();
  }, []);

  const setField = (name, value) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings.id) {
        await base44.entities.SystemSetting.update(settings.id, settings);
      } else {
        const created = await base44.entities.SystemSetting.create(settings);
        setSettings(created);
      }
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  const addZone = () => {
    const zones = settings.zones || [];
    setField('zones', [...zones, { value: '', label: '' }]);
  };

  const updateZone = (idx, field, value) => {
    const zones = [...(settings.zones || [])];
    zones[idx] = { ...zones[idx], [field]: value };
    setField('zones', zones);
  };

  const removeZone = (idx) => {
    const zones = (settings.zones || []).filter((_, i) => i !== idx);
    setField('zones', zones);
  };

  if (!settings) return <div className="py-16 text-center text-sm text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Configuración del sistema">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* General */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">Identidad</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre del sistema</span>
              <input type="text" value={settings.system_name || ''} onChange={(e) => setField('system_name', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Organización</span>
              <input type="text" value={settings.organization_name || ''} onChange={(e) => setField('organization_name', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">URL del logo</span>
              <input type="text" value={settings.logo_url || ''} onChange={(e) => setField('logo_url', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
          </div>
        </div>

        {/* Modules */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">Módulos</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Notificaciones WhatsApp</span>
              <input type="checkbox" checked={settings.enabled_modules?.whatsapp || false}
                onChange={(e) => setField('enabled_modules', { ...settings.enabled_modules, whatsapp: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            </label>
          </div>
        </div>

        {/* Zones */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Zonas de acceso</h2>
            <button onClick={addZone} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>
          <div className="space-y-2">
            {(settings.zones || []).map((z, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input type="text" value={z.value} onChange={(e) => updateZone(idx, 'value', e.target.value)} placeholder="valor"
                  className="w-1/3 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                <input type="text" value={z.label} onChange={(e) => updateZone(idx, 'label', e.target.value)} placeholder="etiqueta"
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500" />
                <button onClick={() => removeZone(idx)} className="rounded p-1 text-red-400 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {(!settings.zones || settings.zones.length === 0) && (
              <p className="py-4 text-center text-xs text-slate-400">Sin zonas configuradas.</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">Configuración de email</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email remitente</span>
              <input type="email" value={settings.mail_from || ''} onChange={(e) => setField('mail_from', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Horas de gracia por defecto</span>
              <input type="number" value={settings.default_grace_hours ?? 4} onChange={(e) => setField('default_grace_hours', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}