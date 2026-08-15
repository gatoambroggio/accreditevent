import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { storeAccessUser, storeFace } from '../../shared/dahuaDigest.ts';

// Sincroniza las personas acreditadas (activas) del evento del dispositivo hacia
// la terminal Dahua: crea/actualiza cada usuario (UserID=badge_code/DNI) y, si la
// persona tiene foto de rostro registrada (Biometric.face_photo_url), la sube.
// Registra cada operación como DahuaCommand (delivered/failed) para auditoría.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['superadmin', 'admin', 'coordinator', 'productora'].includes(user.role)) {
      return Response.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();
    const { device_id, limit } = body;
    if (!device_id) return Response.json({ error: 'device_id es requerido' }, { status: 400 });

    const device = await base44.asServiceRole.entities.DahuaDevice.get(device_id);
    if (!device) return Response.json({ error: 'Dispositivo no encontrado' }, { status: 404 });
    if (!device.ip || !device.username || !device.password) {
      return Response.json({ error: 'Falta configurar IP/usuario/contraseña del dispositivo' }, { status: 400 });
    }

    // Acreditaciones activas del evento del dispositivo
    const filter = { status: 'active' };
    if (device.event_id) filter.event_id = device.event_id;
    const cap = Math.min(Number(limit) || 200, 500);
    const accreds = await base44.asServiceRole.entities.Accreditation.filter(filter, '-created_date', cap);

    if (accreds.length === 0) {
      await base44.asServiceRole.entities.DahuaDevice.update(device.id, { last_error: '' });
      return Response.json({ synced: 0, failed: 0, total: 0, message: 'No hay acreditaciones activas para sincronizar' });
    }

    // Personas (para nombre + buscar foto de rostro)
    const personIds = [...new Set(accreds.map((a) => a.person_id).filter(Boolean))];
    const people = await base44.asServiceRole.entities.Person.filter({ id: { $in: personIds } }, '-created_date', cap);

    // Biometría con foto de rostro del evento
    const bioFilter = { status: 'active', face_photo_url: { $exists: true } };
    if (device.event_id) bioFilter.event_id = device.event_id;
    const bios = await base44.asServiceRole.entities.Biometric.filter(bioFilter, '-created_date', cap);
    const bioByPerson = new Map(bios.filter((b) => b.face_photo_url).map((b) => [b.person_id, b.face_photo_url]));

    let synced = 0, failed = 0;
    const commands = [];

    for (const a of accreds) {
      const person = people.find((p) => p.id === a.person_id);
      const userId = (a.badge_code || person?.document || '').toString().replace(/\s/g, '');
      const userName = person?.full_name || a.person_name || 'Usuario';
      if (!userId) { failed++; commands.push({ device_id: device.id, event_id: device.event_id || '', command_type: 'sync_user', command_data: `skip: sin badge_code (${userName})`, person_id: a.person_id, person_name: userName, status: 'failed', result: 'Sin identificador' }); continue; }

      // 1) Crear/actualizar usuario
      try {
        const r = await storeAccessUser(device, userId, userName);
        if (!r.ok || /error/i.test(r.text)) throw new Error(r.text || `HTTP ${r.status}`);
        synced++;
        commands.push({ device_id: device.id, event_id: device.event_id || '', command_type: 'sync_user', command_data: `UserID=${userId} Name=${userName}`, person_id: a.person_id, person_name: userName, status: 'delivered', result: r.text.slice(0, 200) });

        // 2) Subir rostro si existe foto
        const faceUrl = bioByPerson.get(a.person_id);
        if (faceUrl) {
          try {
            const imgRes = await fetch(faceUrl);
            if (imgRes.ok) {
              const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
              const fr = await storeFace(device, userId, imgBytes);
              commands.push({ device_id: device.id, event_id: device.event_id || '', command_type: 'sync_face', command_data: `UserID=${userId}`, person_id: a.person_id, person_name: userName, status: fr.ok ? 'delivered' : 'failed', result: (fr.text || '').slice(0, 200) });
            }
          } catch (e) {
            commands.push({ device_id: device.id, event_id: device.event_id || '', command_type: 'sync_face', command_data: `UserID=${userId}`, person_id: a.person_id, person_name: userName, status: 'failed', result: e.message });
          }
        }
      } catch (e) {
        failed++;
        commands.push({ device_id: device.id, event_id: device.event_id || '', command_type: 'sync_user', command_data: `UserID=${userId} Name=${userName}`, person_id: a.person_id, person_name: userName, status: 'failed', result: e.message });
      }
    }

    // Registrar comandos en lote
    if (commands.length) {
      try { await base44.asServiceRole.entities.DahuaCommand.bulkCreate(commands); } catch {}
    }

    await base44.asServiceRole.entities.DahuaDevice.update(device.id, { last_error: failed > 0 ? `${failed} fallidos en última sync` : '' });

    return Response.json({ synced, failed, total: accreds.length, commands: commands.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}