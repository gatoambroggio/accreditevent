import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const FONTS = {
  Manrope: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap',
  Montserrat: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap',
  'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap',
  Lato: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap',
  Raleway: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&display=swap',
  'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap',
  Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap',
  'Work Sans': 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&display=swap',
  Rubik: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap',
};

export const FONT_OPTIONS = Object.keys(FONTS).map((name) => ({ value: name, label: name }));

export const DEFAULT_THEME = {
  primary: '#0d6e51',
  accent: '#f5a524',
  background: '#f4f7f4',
  sidebar_bg: '#0a1f17',
  sidebar_fg: '#9db5a8',
  heading_font: 'Manrope',
  body_font: 'Manrope',
  radius: 0.5,
};

export const PRESET_THEMES = [
  { name: 'Verde original', theme: DEFAULT_THEME },
  { name: 'Azul corporativo', theme: { primary: '#1e40af', accent: '#f59e0b', background: '#f0f4f8', sidebar_bg: '#0f172a', sidebar_fg: '#94a3b8', heading_font: 'Inter', body_font: 'Inter', radius: 0.5 } },
  { name: 'Morado moderno', theme: { primary: '#7c3aed', accent: '#ec4899', background: '#faf8fc', sidebar_bg: '#1e1532', sidebar_fg: '#a99bc4', heading_font: 'Poppins', body_font: 'Poppins', radius: 0.625 } },
  { name: 'Naranja energía', theme: { primary: '#ea580c', accent: '#0d9488', background: '#fff8f3', sidebar_bg: '#1c1410', sidebar_fg: '#c4a890', heading_font: 'Montserrat', body_font: 'Open Sans', radius: 0.375 } },
  { name: 'Gris elegante', theme: { primary: '#334155', accent: '#8b5cf6', background: '#f8f8f8', sidebar_bg: '#1e293b', sidebar_fg: '#94a3b8', heading_font: 'Raleway', body_font: 'Lato', radius: 0.25 } },
  { name: 'Rojo intenso', theme: { primary: '#dc2626', accent: '#facc15', background: '#fdf5f5', sidebar_bg: '#1a1010', sidebar_fg: '#c49090', heading_font: 'DM Sans', body_font: 'DM Sans', radius: 0.5 } },
  { name: 'Cyan fresco', theme: { primary: '#0891b2', accent: '#f97316', background: '#f0fdff', sidebar_bg: '#082227', sidebar_fg: '#7fb8c4', heading_font: 'Nunito', body_font: 'Nunito', radius: 0.75 } },
];

function hexToHsl(hex) {
  if (!hex || !hex.startsWith('#')) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function loadFont(name) {
  if (!name || !FONTS[name]) return;
  let link = document.getElementById('theme-font-link');
  if (!link) {
    link = document.createElement('link');
    link.id = 'theme-font-link';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== FONTS[name]) link.href = FONTS[name];
}

export function applyTheme(theme) {
  const t = { ...DEFAULT_THEME, ...theme };
  const root = document.documentElement;
  const setVar = (varName, hex) => {
    const hsl = hexToHsl(hex);
    if (hsl) root.style.setProperty(varName, hsl);
  };
  setVar('--primary', t.primary);
  setVar('--accent', t.accent);
  setVar('--background', t.background);
  setVar('--sidebar-background', t.sidebar_bg);
  setVar('--sidebar-foreground', t.sidebar_fg);
  setVar('--sidebar-primary', t.accent);
  setVar('--sidebar-ring', t.primary);
  setVar('--ring', t.primary);
  if (t.heading_font) {
    root.style.setProperty('--font-heading', `'${t.heading_font}', ui-sans-serif, system-ui, sans-serif`);
    loadFont(t.heading_font);
  }
  if (t.body_font) {
    root.style.setProperty('--font-body', `'${t.body_font}', ui-sans-serif, system-ui, sans-serif`);
    root.style.setProperty('--font-display', `'${t.heading_font}', ui-sans-serif, system-ui, sans-serif`);
    loadFont(t.body_font);
  }
  if (t.radius !== undefined) root.style.setProperty('--radius', `${t.radius}rem`);
}

export function useTheme() {
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (active && all[0]?.theme) applyTheme(all[0].theme);
      } catch {}
    })();
    return () => { active = false; };
  }, []);
}