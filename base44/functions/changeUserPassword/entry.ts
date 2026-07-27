import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!['productora', 'superadmin', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, newPassword } = body;

    if (!userId || !newPassword || newPassword.length < 6) {
      return Response.json({ error: 'userId y newPassword (min 6 caracteres) son obligatorios' }, { status: 400 });
    }

    // Users can always change their own password
    if (userId !== user.id) {
      const ROLE_HIERARCHY = { superadmin: 5, admin: 4, productora: 3, coordinator: 2, control: 1, provider: 0, user: 0 };
      const requesterLevel = ROLE_HIERARCHY[user.role] ?? -1;
      // Only superadmin and admin may change other users' passwords
      if (requesterLevel < 4) {
        return Response.json({ error: 'Forbidden: solo puedes cambiar tu propia contraseña' }, { status: 403 });
      }
      // Fetch target user to enforce strict hierarchy
      const targetUser = await base44.asServiceRole.entities.User.get(userId);
      const targetLevel = ROLE_HIERARCHY[targetUser.role] ?? -1;
      if (targetLevel >= requesterLevel) {
        return Response.json({ error: 'Forbidden: no puedes cambiar la contraseña de un usuario con rol igual o superior' }, { status: 403 });
      }
    }

    await base44.auth.changePassword({ userId, newPassword });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}