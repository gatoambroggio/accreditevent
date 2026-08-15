import { hashPassword } from '../auth/bcrypt.js';

const ROLE_HIERARCHY = { superadmin: 5, admin: 4, productora: 3, coordinator: 2, control: 1, provider: 0, user: 0, pda: 0, empresa: 0, operador: 0 };

export async function changeUserPassword({ userId, newPassword }, { user, prisma }) {
  if (!userId || !newPassword || newPassword.length < 6) throw Object.assign(new Error('userId y newPassword (min 6) obligatorios'), { status: 400 });
  if (userId !== user.id) {
    const reqLevel = ROLE_HIERARCHY[user.role] ?? -1;
    if (reqLevel < 4) throw Object.assign(new Error('Solo puedes cambiar tu propia contraseña'), { status: 403 });
    const target = await prisma.user.findUnique({ where: { id: userId } });
    const targetLevel = ROLE_HIERARCHY[target.role] ?? -1;
    if (targetLevel >= reqLevel) throw Object.assign(new Error('No puedes cambiar la contraseña de un usuario con rol igual o superior'), { status: 403 });
  }
  await prisma.user.update({ where: { id: userId }, data: { password_hash: hashPassword(newPassword) } });
  return { success: true };
}