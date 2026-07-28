import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Save, Upload, ArrowRight } from 'lucide-react';
import { MODULES, ROLES, DEFAULT_ROLE_ACCESS } from '@/lib/modules';
import ListEditor from '@/components/ui/list-editor';

function Field({ label, value, onChange, type = 'text', placeholder = '', hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(type === 'number' ? e.target.value : e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const DEFAULT_PHASES = [
  { value: 'armado', label: 'Armado' },
  { value: 'dia_evento', label: 'Show' },
  { value: 'desarme', label: 'Desarme' },
];
const DEFAULT_EMPLOYMENT = [
  { value: 'fijo', label: 'Fijo' },
  { value: 'eventual', label: 'Eventual' },
];
const DEFAULT_PERSON_TYPES = [
  { value: 'provider', label: 'Proveedor' },
];

const CATALOG_LINKS = [
  { to: '/access-levels', label: 'Niveles de acceso' },
  { to: '/parking-sectors', label: 'Estacionamiento' },
  { to: '/requirement-items', label: 'Ítems de logística' },
  { to: '/documents', label: 'Documentos' },
  { to: '/companies', label: 'Empresas' },
  { to: '/provider-companies', label: 'Empresas de servicios' },
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]) {
          setSettings(all[0]);
        } else {
          const created = await base44.entities.SystemSetting.create({
            system_name: 'AccreditEvent',
            organization_name: 'Acceso Eventos',
            role_access: DEFAULT_ROLE_ACCESS,
            event_phases: DEFAULT_PHASES,
            employment_types: DEFAULT_EMPLOYMENT,
            person_types: DEFAULT_PERSON_TYPES,
            default_grace_hours: 4,
            zones: [],
          });
          setSettings(created);
        }
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const update = (field, value) => setSettings((s) => ({ ...s, [field]: value }));

  const toggleRole = (path, role) => {
    setSettings((s) => {
      const current = s.role_access?.[path] || [];
      const has = current.includes(role);
      const newList = has ? current.filter((r) => r !== role) : [...current, role];
      return { ...s, role_access: { ...(s.role_access || {}), [path]: newList } };
    });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      update('logo_url', file_url);
    } catch {}
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await base44.entities.SystemSetting.update(settings.id, {
        system_name: settings.system_name,
        organization_name: settings.organization_name,
        logo_url: settings.logo_url,
        mail_from: settings.mail_from,
        mail_host: settings.mail_host,
        mail_port: settings.mail_port ? Number(settings.mail_port) : null,
        mail_user: settings.mail_user,
        mail_password: settings.mail_password,
        whatsapp_token: settings.whatsapp_token,
        whatsapp_phone_id: settings.whatsapp_phone_id,
        role_access: settings.role_access,
        event_phases: settings.event_phases,
        employment_types: settings.employment_types,
        person_types: settings.person_types,
        default_grace_hours: settings.default_grace_hours ? Number(settings.default_grace_hours) : null,
        zones: settings.zones,
      });
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-600">Sistema</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Configuración</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">Configuración guardada correctamente.</div>}

      <Section title="General" description="Identidad visual del sistema">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre del sistema" value={settings.system_name} onChange={(v) => update('system_name', v)} placeholder="AccreditEvent" />
          <Field label="Nombre de la organización" value={settings.organization_name} onChange={(v) => update('organization_name', v)} placeholder="Acceso Eventos" />
        </div>
        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Logo del sistema</span>
          {settings.logo_url ? (
            <div className="flex items-center gap-4">
              <img src={settings.logo_url} alt="Logo" className="h-16 rounded-lg object-contain" />
              <button onClick={() => update('logo_url', '')} className="text-xs text-red-500 hover:underline">Quitar</button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Subiendo…' : 'Subir logo'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
            </label>
          )}
        </div>
      </Section>

      <Section title="Fases de evento" description="Configurá las fases disponibles para los eventos (armado, show, desarme, etc.)">
        <ListEditor
          items={settings.event_phases || []}
          onChange={(items) => update('event_phases', items)}
          valuePlaceholder="armado"
          labelPlaceholder="Armado"
        />
      </Section>

      <Section title="Tipos de contratación" description="Configurá los tipos de contratación de empleados">
        <ListEditor
          items={settings.employment_types || []}
          onChange={(items) => update('employment_types', items)}
          valuePlaceholder="fijo"
          labelPlaceholder="Fijo"
        />
      </Section>

      <Section title="Tipos de persona" description="Configurá los tipos de persona del sistema">
        <ListEditor
          items={settings.person_types || []}
          onChange={(items) => update('person_types', items)}
          valuePlaceholder="provider"
          labelPlaceholder="Proveedor"
        />
      </Section>

      <Section title="Zonas de control de acceso" description="Zonas configurables para el control de acceso (también podés gestionarlas desde Niveles de acceso)">
        <ListEditor
          items={settings.zones || []}
          onChange={(items) => update('zones', items)}
          valuePlaceholder="backstage"
          labelPlaceholder="Backstage"
        />
      </Section>

      <Section title="Configuración de eventos" description="Parámetros por defecto para nuevos eventos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Horas de gracia por defecto" type="number" value={settings.default_grace_hours} onChange={(v) => update('default_grace_hours', v)} placeholder="4" hint="Horas extra de acceso tras finalizar el evento" />
        </div>
      </Section>

      <Section title="Servidor de correo" description="Configuración SMTP para envío de notificaciones">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email remitente" value={settings.mail_from} onChange={(v) => update('mail_from', v)} placeholder="noreply@empresa.com" />
          <Field label="Host SMTP" value={settings.mail_host} onChange={(v) => update('mail_host', v)} placeholder="smtp.gmail.com" />
          <Field label="Puerto" type="number" value={settings.mail_port} onChange={(v) => update('mail_port', v)} placeholder="587" />
          <Field label="Usuario" value={settings.mail_user} onChange={(v) => update('mail_user', v)} placeholder="usuario@empresa.com" />
          <Field label="Contraseña" type="password" value={settings.mail_password} onChange={(v) => update('mail_password', v)} placeholder="••••••••" />
        </div>
      </Section>

      <Section title="WhatsApp Cloud API" description="Credenciales para envío de mensajes por WhatsApp">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Token de acceso" type="password" value={settings.whatsapp_token} onChange={(v) => update('whatsapp_token', v)} placeholder="EAAxxxxxxxxx" />
          <Field label="Phone Number ID" value={settings.whatsapp_phone_id} onChange={(v) => update('whatsapp_phone_id', v)} placeholder="123456789" />
        </div>
      </Section>

      <Section title="Acceso por roles" description="Marcá qué roles pueden acceder a cada módulo del sistema">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">Módulo</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-slate-500">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.path} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900">{m.label}</td>
                  {ROLES.map((r) => {
                    const checked = settings.role_access?.[m.path]?.includes(r) ?? DEFAULT_ROLE_ACCESS[m.path]?.includes(r) ?? false;
                    return (
                      <td key={r} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(m.path, r)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Catálogos" description="Acceso rápido a la gestión de catálogos del sistema">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATALOG_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50">
              {link.label} <ArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}