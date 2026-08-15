import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { openDoor, rebootDevice, deleteAccessUser, getDeviceStatus } from '../../shared/dahuaDigest.ts';

// Ejecuta una acción remota contra la terminal Dahua:
//   action: 'open_door' | 'reboot' | 'delete_user' | 'status'
//   user_id (para delete_user), channel (para open_door, opcional)
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['superadmin', 'admin', 'coordinator', 'productora'].includes(user.role)) {
      return Response.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();
    const { device_id, action, user_id, channel } = body;
    if (!device_id || !action) return Response.json({ error: 'device_id y action son requeridos' }, { status: 400 });

    const device = await base44.asServiceRole.entities.DahuaDevice.get(device_id);
    if (!device) return Response.json({ error: 'Dispositivo no encontrado' }, { status: 404 });
    if (!device.ip || !device.username || !device.password) {
      return Response.json({ error: 'Falta configurar IP/usuario/contraseña del dispositivo' }, { status: 400 });
    }

    let r;
    let commandType = action;
    let commandData = '';
    let personName = '';

    if (action === 'open_door') {
      const ch = channel != null ? Number(channel) : (device.door_channel ?? 0);
      r = await openDoor(device, ch);
      commandData = `channel=${ch}`;
    } else if (action === 'reboot') {
      r = await rebootDevice(device);
      commandData = 'reboot';
    } else if (action === 'delete_user') {
      if (!user_id) return Response.json({ error: 'user_id requerido para delete_user' }, { status: 400 });
      r = await deleteAccessUser(device, user_id);
      commandData = `UserID=${user_id}`;
      try {
        const accreds = await base44.asServiceRole.entities.Accreditation.filter({ badge_code: user_id }, '-created_date', 1);
        personName = accreds[0]?.person_name || '';
      } catch {}
    } else if (action === 'status') {
      r = await getDeviceStatus(device);
      commandType = 'status';
      commandData = 'getSystemInfo';
    } else {
      return Response.json({ error: 'Acción no soportada' }, { status: 400 });
    }

    const ok = r.ok && !/error/i.test(r.text);
    // Registrar comando
    try {
      await base44.asServiceRole.entities.DahuaCommand.create({
        device_id: device.id,
        event_id: device.event_id || '',
        command_type: commandType,
        command_data: commandData,
        person_name: personName,
        status: ok ? 'delivered' : 'failed',
        result: (r.text || '').slice(0, 300),
      });
    } catch {}

    await base44.asServiceRole.entities.DahuaDevice.update(device.id, { last_error: ok ? '' : (r.text || `HTTP ${r.status}`).slice(0, 200) });

    return Response.json({ ok, status: r.status, text: r.text });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}