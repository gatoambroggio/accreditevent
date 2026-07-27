import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  IdCard,
  FileText,
  ShieldCheck,
  ScrollText,
  UserCircle,
  LogOut,
  Menu,
  X,
  DoorOpen,
  Radio,
  MessageSquare,
  ScanFace,
  BarChart3,
  Settings as SettingsIcon,
  Layers,
  Cpu,
  Car,
  SquareParking,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

export const ROLE_LEVEL = { provider: -1, control: 0, coordinator: 1, productora: 1, admin: 2, superadmin: 3 };

const NAV_ITEMS = [
  { path: '/', label: 'Resumen', icon: LayoutDashboard, minLevel: 0 },
  { path: '/events', label: 'Eventos', icon: CalendarDays, minLevel: 1 },
  { path: '/people', label: 'Personas', icon: Users, minLevel: 1 },
  { path: '/accreditations', label: 'Acreditaciones', icon: IdCard, minLevel: 0 },
  { path: '/access-levels', label: 'Niveles de acceso', icon: Layers, minLevel: 1 },
  { path: '/accreditation-facial', label: 'Acreditación facial', icon: ScanFace, minLevel: 1 },
  { path: '/access-control', label: 'Control de acceso', icon: DoorOpen, minLevel: 0 },
  { path: '/access-monitor', label: 'Monitor en vivo', icon: Radio, minLevel: 0 },
  { path: '/zkteco-devices', label: 'Terminales ZKTeco', icon: Cpu, minLevel: 1 },
  { path: '/reports', label: 'Reportes', icon: BarChart3, minLevel: 1 },
  { path: '/messages', label: 'Mensajes', icon: MessageSquare, minLevel: 1 },
  { path: '/documents', label: 'Documentos', icon: FileText, minLevel: 1 },
  { path: '/vehicles', label: 'Vehículos', icon: Car, minLevel: 1 },
  { path: '/parking-sectors', label: 'Estacionamiento', icon: SquareParking, minLevel: 1 },
  { path: '/users', label: 'Usuarios y roles', icon: ShieldCheck, minLevel: 2 },
  { path: '/audit', label: 'Auditoría', icon: ScrollText, minLevel: 2 },
  { path: '/settings', label: 'Configuración', icon: SettingsIcon, minLevel: 2 },
  { path: '/portal', label: 'Mi portal', icon: UserCircle, providerOnly: true },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.SystemSetting.list('-created_date', 1);
        if (all[0]) setSettings(all[0]);
      } catch {}
    })();
  }, []);

  const userLevel = ROLE_LEVEL[user?.role] ?? -1;
  const isProvider = user?.role === 'provider';
  const sysName = settings?.system_name || 'acceso';
  const orgName = settings?.organization_name || 'Acceso Eventos';
  const logoUrl = settings?.logo_url;

  useEffect(() => {
    if (isProvider && location.pathname !== '/portal') {
      navigate('/portal', { replace: true });
    }
  }, [isProvider, location.pathname, navigate]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.providerOnly) return isProvider;
    if (isProvider) return false;
    if (settings?.role_access?.[item.path]) {
      return settings.role_access[item.path].includes(user?.role);
    }
    return userLevel >= item.minLevel;
  });

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-[hsl(157_42%_11%)] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded-md object-cover" />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[hsl(39_86%_63%)] text-xs font-extrabold text-[hsl(146_34%_11%)]">A</span>
          )}
          <span className="text-base font-extrabold tracking-tight text-white">{sysName}</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-[hsl(157_42%_11%)] text-slate-300 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-6">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            )}
            <span className="text-lg font-extrabold tracking-tight text-white">{sysName}</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-4 mb-5 rounded-lg border border-white/10 px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/70">Organización</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{orgName}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-2 truncate text-sm font-semibold text-white">{user?.full_name || user?.email || 'Usuario'}</div>
          <div className="mb-3">
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
              {user?.role || 'user'}
            </span>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}