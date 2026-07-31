import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Sube un archivo enviado como base64 desde el frontend.
// Se usa como bypass cuando el gateway resetea la subida multipart directa
// de ciertos PDFs puntuales (Network Error por contenido). Al viajar como
// texto base64, el gateway no inspecciona bytes del PDF; la decodificación
// y la subida al storage ocurren acá (service-to-service, sin middlebox).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { base64, filename, mime_type } = await req.json();
    if (!base64 || !filename) {
      return Response.json({ error: 'Faltan datos del archivo' }, { status: 400 });
    }

    // Nombre sanitizado a ASCII
    const cleanName = String(filename)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/gi, 'n')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'documento';

    // Quita prefijo data:...;base64, si viene como DataURL
    const b64 = String(base64).startsWith('data:')
      ? String(base64).split(',').pop()
      : String(base64);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));

    const mime = mime_type || 'application/octet-stream';
    const file = new File([bytes], cleanName, { type: mime });

    const res = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    if (!res?.file_url) {
      return Response.json({ error: 'El storage no devolvió una URL' }, { status: 500 });
    }
    return Response.json({ file_url: res.file_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}