import { openDoor, rebootDevice, deleteAccessUser, getDeviceStatus } from '../shared/dahuaDigest.js';

export async function dahuaRemoteAction({ device_id, action, user_id, channel }, { user, prisma }) {
  if (!['superadmin', 'admin', 'coordinator', 'productora'].includes(user.role)) throw Object.assign(new Error('Sin permisos'), { status: 403 });
  if (!device_id || !action) throw Object.assign(new Error('device_id y action requeridos'), { status: 400 });
  const device = await prisma.dahuaDevice.findUnique({ where: { id: device_id } });
  if (!device) throw Object.assign(new Error('Dispositivo no encontrado'), { status: 404 });

  let r, commandType = action, commandData = '', personName = '';
  if (action === 'open_door') {
    const ch = channel != null ? Number(channel) : (device.door_channel ?? 0);
    r = await openDoor(device, ch); commandData = `channel=${ch}`;
  } else if (action === 'reboot') {
    r = await rebootDevice(device); commandData = 'reboot';
  } else if (action === 'delete_user') {
    if (!user_id) throw Object.assign(new Error('user_id requerido'), { status: 400 });
    r = await deleteAccessUser(device, user_id); commandData = `UserID=${user_id}`;
    const acc = await prisma.accreditation.findFirst({ where: { badge_code: user_id } });
    personName = acc?.person_name || '';
  } else if (action === 'status') {
    r = await getDeviceStatus(device); commandType = 'status'; commandData = 'getSystemInfo';
  } else throw Object.assign(new Error('Acción no soportada'), { status: 400 });

  const ok = r.ok && !/error/i.test(r.text);
  await prisma.dahuaCommand.create({ data: { device_id: device.id, event_id: device.event_id || null, command_type: commandType, command_data: commandData, person_name: personName, status: ok ? 'delivered' : 'failed', result: (r.text || '').slice(0, 300) } });
  await prisma.dahuaDevice.update({ where: { id: device.id }, data: { last_error: ok ? '' : (r.text || `HTTP ${r.status}`).slice(0, 200) } });
  return { ok, status: r.status, text: r.text };
}