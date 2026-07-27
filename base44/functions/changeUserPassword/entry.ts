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

    await base44.auth.changePassword({ userId, newPassword });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}