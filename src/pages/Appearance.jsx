import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Save, RotateCcw, Palette, Type, Square, Check } from 'lucide-react';
import { applyTheme, DEFAULT_THEME, FONT_OPTIONS, PRESET_THEMES } from '@/lib/useTheme';
import PageHeader from '@/components/ui/page-header';

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200" />
        </div>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-28 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, description, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function Appearance() {
  const [settings, setSettings] = useState(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]) {
          setSettings(all[0]);
          setTheme({ ...DEFAULT_THEME, ...(all[0].theme || {}) });
        }
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const update = (key, value) => setTheme((t) => ({ ...t, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await base44.entities.SystemSetting.update(settings.id, { theme });
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setTheme(DEFAULT_THEME);

  if (!settings) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Apariencia">
        <button onClick={handleReset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
          <RotateCcw className="h-4 w-4" /> Restaurar
        </button>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </button>
      </PageHeader>

      {success && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">Personalización guardada. Los cambios se aplicaron a todo el sistema.</div>}
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}

      <Section title="Temas predefinidos" icon={Palette} description="Partí de un tema predefinido y luego ajustá los detalles.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PRESET_THEMES.map((preset) => {
            const isActive = JSON.stringify(preset.theme) === JSON.stringify(theme);
            return (
              <button key={preset.name} onClick={() => setTheme(preset.theme)} className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition ${isActive ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex -space-x-1">
                  <span className="h-6 w-6 rounded-full border-2 border-white" style={{ background: preset.theme.primary }} />
                  <span className="h-6 w-6 rounded-full border-2 border-white" style={{ background: preset.theme.accent }} />
                  <span className="h-6 w-6 rounded-full border-2 border-white" style={{ background: preset.theme.sidebar_bg }} />
                </div>
                <span className="flex-1 text-xs font-semibold text-slate-700">{preset.name}</span>
                {isActive && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Colores" icon={Palette} description="Personalizá cada color del sistema. Los cambios se aplican en tiempo real.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ColorField label="Color primario" value={theme.primary} onChange={(v) => update('primary', v)} />
          <ColorField label="Color de acento" value={theme.accent} onChange={(v) => update('accent', v)} />
          <ColorField label="Color de fondo" value={theme.background} onChange={(v) => update('background', v)} />
          <ColorField label="Fondo barra lateral" value={theme.sidebar_bg} onChange={(v) => update('sidebar_bg', v)} />
          <ColorField label="Texto barra lateral" value={theme.sidebar_fg} onChange={(v) => update('sidebar_fg', v)} />
        </div>
      </Section>

      <Section title="Tipografía" icon={Type} description="Elegí las fuentes para títulos y cuerpo de texto.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Fuente de títulos</span>
            <select value={theme.heading_font} onChange={(e) => update('heading_font', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" style={{ fontFamily: theme.heading_font }}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Fuente de cuerpo</span>
            <select value={theme.body_font} onChange={(e) => update('body_font', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" style={{ fontFamily: theme.body_font }}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Formato" icon={Square} description="Ajustá el radio de los bordes y esquinas.">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Radio de bordes: <span className="font-mono text-primary">{theme.radius}rem</span></span>
          <input type="range" min="0" max="1.5" step="0.0625" value={theme.radius} onChange={(e) => update('radius', parseFloat(e.target.value))} className="w-full max-w-md accent-primary" />
          <div className="mt-2 flex gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500" style={{ borderRadius: '0rem' }}>Recto</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500" style={{ borderRadius: '0.5rem' }}>Suave</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500" style={{ borderRadius: '1rem' }}>Redondo</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500" style={{ borderRadius: '1.5rem' }}>Muy redondo</span>
          </div>
        </label>
      </Section>

      <Section title="Vista previa" icon={Check} description="Así se verá el sistema con la configuración actual.">
        <div className="overflow-hidden rounded-xl border border-slate-200" style={{ borderRadius: `${theme.radius}rem` }}>
          <div className="flex">
            <div className="w-32 p-3" style={{ background: theme.sidebar_bg }}>
              <div className="mb-3 flex items-center gap-1.5">
                <span className="grid h-6 w-6 place-items-center text-xs font-bold" style={{ background: theme.accent, color: theme.sidebar_bg, borderRadius: `${theme.radius * 0.5}rem` }}>A</span>
                <span className="text-xs font-bold" style={{ color: theme.sidebar_fg }}>Sistema</span>
              </div>
              <div className="space-y-1">
                <div className="rounded px-2 py-1.5 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>Inicio</div>
                <div className="px-2 py-1.5 text-xs" style={{ color: theme.sidebar_fg }}>Eventos</div>
                <div className="px-2 py-1.5 text-xs" style={{ color: theme.sidebar_fg }}>Personas</div>
              </div>
            </div>
            <div className="flex-1 p-5" style={{ background: theme.background }}>
              <p className="mb-1 text-[10px] font-mono uppercase tracking-wider" style={{ color: theme.primary }}>RESUMEN</p>
              <h3 className="text-lg font-extrabold" style={{ color: '#0f172a', fontFamily: theme.heading_font }}>Bienvenido al sistema</h3>
              <p className="mt-1 text-xs" style={{ color: '#64748b', fontFamily: theme.body_font }}>Este es un texto de ejemplo con la fuente seleccionada.</p>
              <div className="mt-3 flex gap-2">
                <button className="px-3 py-1.5 text-xs font-bold text-white" style={{ background: theme.primary, borderRadius: `${theme.radius * 0.5}rem` }}>Botón primario</button>
                <button className="px-3 py-1.5 text-xs font-bold" style={{ background: 'transparent', border: `1px solid ${theme.primary}`, color: theme.primary, borderRadius: `${theme.radius * 0.5}rem` }}>Secundario</button>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold" style={{ background: theme.accent, color: '#0f172a', borderRadius: `${theme.radius * 0.5}rem` }}>Etiqueta</span>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}