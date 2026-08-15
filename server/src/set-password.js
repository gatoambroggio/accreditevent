// Air-gap: setea/promueve un usuario importado desde la nube para que pueda
// loguearse localmente. La nube no exporta password_hash, así que los usuarios
// migrados quedan con un placeholder y no entran. Este script les asigna una
// contraseña real y (opcional) las promueve a un rol admin.
//
// Uso:
//   node src/set-password.js <email> <nuevaPassword> [rol]
// Ej:
//   node src/set-password.js juan@gmail.com mipass123 admin
//   node src/set-password.js juan@gmail.com mipass123 superadmin
//
// Rol opcional: user | productora | coordinator | admin | superadmin
// Si se omite, conserva el rol que ya tenía en la importación.

import { prisma } from './db/prisma.js';
import { hashPassword } from './auth/bcrypt.js';

async function main() {
  const [, , emailArg, passwordArg, roleArg] = process.argv;
  if (!emailArg || !passwordArg) {
    console.error('Uso: node src/set-password.js <email> <nuevaPassword> [rol]');
    console.error('  rol opcional: user | productora | coordinator | admin | superadmin');
    process.exit(1);
    if (passwordArg.length < 6) {
      console.error('✗ La contraseña debe tener al menos 6 caracteres');
      process.exit(1);
    }
  }
  const email = String(emailArg).toLowerCase();

  const validRoles = ['user', 'provider', 'empresa', 'control', 'operador', 'coordinator', 'productora', 'admin', 'superadmin'];
  if (roleArg && !validRoles.includes(roleArg)) {
    console.error(`✗ Rol inválido: ${roleArg}. Válidos: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`✗ No existe un usuario con email "${email}" en la base local.`);
    console.error('  Importá el ZIP primero (npm run import:from-zip) o crealo con el alta de usuarios.');
    process.exit(1);
  }

  const update = { password_hash: hashPassword(passwordArg), email_verified: true };
  if (roleArg) update.role = roleArg;

  const updated = await prisma.user.update({ where: { email }, data: update });
  console.log(`✓ Usuario actualizado:`);
  console.log(`    email: ${updated.email}`);
  console.log(`    nombre: ${updated.full_name || '(sin nombre)'}`);
  console.log(`    rol: ${updated.role}`);
  console.log(`    contraseña: lista para loguear`);
  console.log(`\nEntrá al panel con ese email y la nueva contraseña.`);
}

main().catch((e) => {
  console.error('✗ Error:', e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());