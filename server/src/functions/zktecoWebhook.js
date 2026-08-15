// Lógica del webhook ZKTeco (protocolo iClock). Se monta como ruta pública.
// GET ?options → handshake; GET (sin options) → polling de comandos; POST → push de accesos.
export async function handleZktGetOptions() {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return ['GET OPTION FROM: device', 'Stamp: ' + now, 'OpStamp: ' + now, 'PhotoStamp: ' + now, 'ErrorDelay: 30', 'Delay: 30', 'TransTimes: 00:00;14:05', 'TransInterval: 1', 'TransFlag: Identity', 'Realtime: 1', 'Encrypt: none'].join('\n');
}

export async function handleZktGetCommands(device, prisma) {
  const commands = await prisma.zkTecoCommand.findMany({ where: { device_id: device.id, status: 'pending' }, orderBy: { created_at: 'desc' }, take: 50 });
  if (commands.length === 0) return 'OK';
  const lines = commands.map((c) => c.command_data);
  await prisma.zkTecoCommand.updateMany({ where: { id: { in: commands.map((c) => c.id) } }, data: { status: 'delivered' } });
  return lines.join('\n');
}

export async function handleZktPost(device, bodyText, prisma) {
  if (bodyText.startsWith('data=')) bodyText = bodyText.substring(5);
  try { bodyText = decodeURIComponent(bodyText); } catch {}
  const lines = bodyText.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    const offset = parts[0] === 'ATTLOG' ? 1 : 0;
    const userId = parts[offset];
    if (!userId) continue;
    const accred = await prisma.accreditation.findFirst({ where: { badge_code: userId } });
    await prisma.accessLog.create({ data: {
      accreditation_id: accred?.id || 'unknown', person_name: accred?.person_name || `Usuario ${userId}`,
      badge_code: userId, event_name: accred?.event_name || device.event_name || '', event_id: accred?.event_id || device.event_id || null,
      company: accred?.company || '', verified_by: `ZKTeco ${device.name}`, method: 'biometric', resource_type: 'person',
      zone: device.zone || '', result: accred ? 'granted' : 'denied', access_level: accred?.access_level || '',
    } });
  }
}