export const MODULES = [
  { path: '/', label: 'Resumen' },
  { path: '/events', label: 'Eventos' },
  { path: '/people', label: 'Personas' },
  { path: '/accreditations', label: 'Acreditaciones' },
  { path: '/accreditation-facial', label: 'Acreditación facial' },
  { path: '/access-control', label: 'Control de acceso' },
  { path: '/access-monitor', label: 'Monitor en vivo' },
  { path: '/zkteco-devices', label: 'Terminales ZKTeco' },
  { path: '/reports', label: 'Reportes' },
  { path: '/messages', label: 'Mensajes' },
  { path: '/documents', label: 'Documentos' },
  { path: '/vehicles', label: 'Vehículos' },
  { path: '/users', label: 'Usuarios y roles' },
  { path: '/audit', label: 'Auditoría' },
  { path: '/settings', label: 'Configuración' },
];

export const ROLES = ['control', 'coordinator', 'admin', 'superadmin'];

export const DEFAULT_ROLE_ACCESS = {
  '/': ['control', 'coordinator', 'admin', 'superadmin'],
  '/events': ['coordinator', 'admin', 'superadmin'],
  '/people': ['coordinator', 'admin', 'superadmin'],
  '/accreditations': ['control', 'coordinator', 'admin', 'superadmin'],
  '/accreditation-facial': ['coordinator', 'admin', 'superadmin'],
  '/access-control': ['control', 'coordinator', 'admin', 'superadmin'],
  '/access-monitor': ['control', 'coordinator', 'admin', 'superadmin'],
  '/zkteco-devices': ['coordinator', 'admin', 'superadmin'],
  '/reports': ['coordinator', 'admin', 'superadmin'],
  '/messages': ['coordinator', 'admin', 'superadmin'],
  '/documents': ['coordinator', 'admin', 'superadmin'],
  '/vehicles': ['coordinator', 'admin', 'superadmin'],
  '/users': ['admin', 'superadmin'],
  '/audit': ['admin', 'superadmin'],
  '/settings': ['admin', 'superadmin'],
};