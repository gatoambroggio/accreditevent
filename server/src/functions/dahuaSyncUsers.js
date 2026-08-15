import { storeAccessUser, storeFace } from '../shared/dahuaDigest.js';

// Sincroniza acreditaciones activas del evento del dispositivo a la terminal Dahua.
export async function dahuaSyncUsers({ device_id, limit }, { user, prisma }) {
  if (!['superadmin', 'admin', 'coordinator', 'productora'].includes(user.role)) throw Object.assign(new Error('Sin permisos'), { status: 403 });
  if (!device_id) throw Object.assign(new Error('device_id requerido'), { status: 400 });
  const device = await prisma.dahuaDevice.findUnique({ where: { id: device_id } });
  if (!device) throw Object.assign(new Error('Dispositivo no encontrado'), { status: 404 });
  if (!device.ip || !device.username || !device.password) throw Object.assign(new Error('Falta IP/usuario/contraseña'), { status: 400 });

  const filter = { status: 'active' };
  if (device.event_id) filter.event_id = device.event_id;
  const cap = Math.min(Number(limit) || 200, 500);
  const accreds = await prisma.accreditation.findMany({ where: filter, take: cap, orderBy: { created_at: 'desc' } });
  if (accreds.length === 0) {
    await prisma.dahuaDevice.update({ where: { id: device.id }, data: { last_error: '' } });
    return { synced: 0, failed: 0, total: 0, message: 'No hay acreditaciones activas' };
  }
  const personIds = [...new Set(accreds.map((a) => a.person_id).filter(Boolean))];
  const people = await prisma.person.findMany({ where: { id: { in: personIds } }, take: cap });
  const bioFilter = { status: 'active', NOT: { face_photo_url: null } };
  if (device.event_id) bioFilter.event_id = device.event_id;
  const bios = await prisma.biometric.findMany({ where: bioFilter, take: cap });
  const bioByPerson = new Map(bios.filter((b) => b.face_photo_url).map((b) => [b.person_id, b.face_photo_url]));

  let synced = 0, failed = 0;
  const commands = [];
  for (const a of accreds) {
    const person = people.find((p) => p.id === a.person_id);
    const userId = (a.badge_code || person?.document || '').toString().replace(/\s/g, '');
    const userName = person?.full_name || a.person_name || 'Usuario';
    if (!userId) { failed++; commands.push({ device_id: device.id, event_id: device.event_id || null, command_type: 'sync_user', command_data: `skip: sin badge_code (${userName})`, person_id: a.person_id, person_name: userName, status: 'failed', result: 'Sin identificador' }); continue; }
    try {
      const r = await storeAccessUser(device, userId, userName);
      if (!r.ok || /error/i.test(r.text)) throw new Error(r.text || `HTTP ${r.status}`);
      synced++;
      commands.push({ device_id: device.id, event_id: device.event_id || null, command_type: 'sync_user', command_data: `UserID=${userId} Name=${userName}`, person_id: a.person_id, person_name: userName, status: 'delivered', result: (r.text || '').slice(0, 200) });
      const faceUrl = bioByPerson.get(a.person_id);
      if (faceUrl) {
        try {
          const imgRes = await fetch(faceUrl);
          if (imgRes.ok) {
            const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
            const fr = await storeFace(device, userId, imgBytes);
            commands.push({ device_id: device.id, event_id: device.event_id || null, command_type: 'sync_face', command_data: `UserID=${userId}`, person_id: a.person_id, person_name: userName, status: fr.ok ? 'delivered' : 'failed', result: (fr.text || '').slice(0, 200) });
          }
        } catch (e) {
          commands.push({ device_id: device.id, event_id: device.event_id || null, command_type: 'sync_face', command_data: `UserID=${userId}`, person_id: a.person_id, person_name: userName, status: 'failed', result: e.message });
        }
      }
    } catch (e) {
      failed++;
      commands.push({ device_id: device.id, event_id: device.event_id || null, command_type: 'sync_user', command_data: `UserID=${userId} Name=${userName}`, person_id: a.person_id, person_name: userName, status: 'failed', result: e.message });
    }
  }
  if (commands.length) await prisma.dahuaCommand.createMany({ data: commands });
  await prisma.dahuaDevice.update({ where: { id: device.id }, data: { last_error: failed > 0 ? `${failed} fallidos en última sync` : '' } });
  return { synced, failed, total: accreds.length, commands: commands.length };
}