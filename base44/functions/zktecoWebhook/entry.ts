import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const params = url.searchParams;
    const method = req.method;

    const sn = params.get('SN') || '';
    const apiKey = params.get('key') || '';

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // Handshake: device sends GET with options param
    if (method === 'GET' && params.has('options')) {
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const cfg = [
        'GET OPTION FROM: ' + (req.headers.get('x-forwarded-for') || 'device'),
        'Stamp: ' + now,
        'OpStamp: ' + now,
        'PhotoStamp: ' + now,
        'ErrorDelay: 30',
        'Delay: 30',
        'TransTimes: 00:00;14:05',
        'TransInterval: 1',
        'TransFlag: Identity',
        'Realtime: 1',
        'Encrypt: none',
      ].join('\n');
      return new Response(cfg, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Validate device for all other requests
    if (!sn) {
      return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const devices = await base44.asServiceRole.entities.ZKTecoDevice.filter({ serial_number: sn });
    const device = devices[0];

    if (!device) {
      return new Response('ERROR: Device not registered', { status: 403, headers: { 'Content-Type': 'text/plain' } });
    }

    if (device.api_key && apiKey !== device.api_key) {
      return new Response('ERROR: Auth failed', { status: 403, headers: { 'Content-Type': 'text/plain' } });
    }

    // Update last seen
    await base44.asServiceRole.entities.ZKTecoDevice.update(device.id, {
      last_seen: new Date().toISOString(),
      status: 'active',
    });

    // GetRequest: device polls for pending commands
    if (method === 'GET') {
      const commands = await base44.asServiceRole.entities.ZKTecoCommand.filter(
        { device_id: device.id, status: 'pending' },
        '-created_date',
        50
      );

      if (commands.length === 0) {
        return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }

      const lines = commands.map((c) => c.command_data);

      // Mark commands as delivered
      for (const cmd of commands) {
        await base44.asServiceRole.entities.ZKTecoCommand.update(cmd.id, { status: 'delivered' });
      }

      return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // POST: device pushes attendance / access data
    if (method === 'POST') {
      let bodyText = '';
      const contentType = req.headers.get('content-type') || '';

      if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData();
        bodyText = formData.get('data') || formData.get('content') || '';
      } else {
        bodyText = await req.text();
      }

      // Clean up: some devices prefix with data= or encode
      if (bodyText.startsWith('data=')) bodyText = bodyText.substring(5);
      try {
        bodyText = decodeURIComponent(bodyText);
      } catch {}

      const lines = bodyText.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        const parts = line.split('\t');

        if (parts.length >= 4) {
          const offset = parts[0] === 'ATTLOG' ? 1 : 0;
          const userId = parts[offset];
          const timestamp = parts[offset + 1];
          const verifyType = parts[offset + 2];

          if (!userId || !timestamp) continue;

          // Find accreditation by badge code
          const accreds = await base44.asServiceRole.entities.Accreditation.filter(
            { badge_code: userId },
            '-created_date',
            1
          );
          const accred = accreds[0];

          await base44.asServiceRole.entities.AccessLog.create({
            accreditation_id: accred?.id || '',
            person_name: accred?.person_name || `Usuario ${userId}`,
            badge_code: userId,
            event_name: accred?.event_name || device.event_name || '',
            event_id: accred?.event_id || device.event_id || '',
            verified_by: `ZKTeco ${device.name}`,
            method: 'biometric',
            zone: device.zone || '',
            result: accred ? 'granted' : 'denied',
            access_level: accred?.access_level || '',
          });
        }
      }

      return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}