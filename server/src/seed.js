// Seed mínimo: crea un superadmin, settings por defecto, niveles de acceso y
// sectores base. Corré: npm run seed

import { prisma } from './db/prisma.js';
import { hashPassword } from './auth/bcrypt.js';

async function main() {
  const email = process.env.SEED_EMAIL || 'admin@accreditevent.local';
  const password = process.env.SEED_PASSWORD || 'admin123';

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password_hash: hashPassword(password),
      full_name: 'Administrador',
      role: 'superadmin',
      email_verified: true,
      data: { company: '' },
    },
  });

  await prisma.systemSetting.upsert({
    where: { id: (await prisma.systemSetting.findFirst())?.id || '__new__' },
    update: {},
    create: {
      system_name: 'AccreditEvent',
      organization_name: 'Organización',
      zones: [{ value: 'general', label: 'General' }, { value: 'backstage', label: 'Backstage' }, { value: 'tecnica', label: 'Técnica' }, { value: 'vip', label: 'VIP' }],
      parking_sectors: [{ value: 'general', label: 'Estacionamiento general' }, { value: 'vip', label: 'VIP' }, { value: 'carga', label: 'Carga' }],
      event_phases: [{ value: 'armado', label: 'Armado' }, { value: 'dia_evento', label: 'Día del evento' }, { value: 'desarme', label: 'Desarme' }],
      default_grace_hours: 4,
      role_access: {},
      enabled_modules: {},
    },
  });

  await prisma.accessLevel.upsert({ where: { value: 'general' }, update: {}, create: { value: 'general', label: 'General', badge_prefix: 'GEN' } });
  await prisma.accessLevel.upsert({ where: { value: 'backstage' }, update: {}, create: { value: 'backstage', label: 'Backstage', badge_prefix: 'BCK' } });
  await prisma.accessLevel.upsert({ where: { value: 'tecnica' }, update: {}, create: { value: 'tecnica', label: 'Técnica', badge_prefix: 'TEC' } });
  await prisma.accessLevel.upsert({ where: { value: 'vip' }, update: {}, create: { value: 'vip', label: 'VIP', badge_prefix: 'VIP' } });

  await prisma.parkingSector.upsert({ where: { value: 'general' }, update: {}, create: { value: 'general', label: 'General', capacity: 100 } });
  await prisma.parkingSector.upsert({ where: { value: 'vip' }, update: {}, create: { value: 'vip', label: 'VIP', capacity: 30 } });
  await prisma.parkingSector.upsert({ where: { value: 'carga' }, update: {}, create: { value: 'carga', label: 'Carga', capacity: 20 } });

  console.log(`[seed] Superadmin creado: ${email} / ${password} (id: ${user.id})`);
  console.log('[seed] Settings, niveles de acceso y sectores iniciales cargados.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());