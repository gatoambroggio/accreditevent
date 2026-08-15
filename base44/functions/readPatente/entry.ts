import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Lee la patente (dominio) de un automotor argentino desde una imagen.
// Recibe { file_url } (subida previa vía UploadFile) y usa InvokeLLM con visión
// para extraer el texto, normalizarlo y validarlo contra los formatos argentinos.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_url } = body;
    if (!file_url) return Response.json({ error: 'file_url es requerido' }, { status: 400 });

    const prompt = `Sos un lector de patentes (dominios) de automotores argentinos. Analizá la imagen y extraé la patente visible.

Formatos válidos de patentes argentinas:
- Auto Mercosur (desde 2016): 2 letras + 3 números + 2 letras (ej: "AB 123 CD")
- Auto antiguo (hasta 1995): 3 letras + 3 números (ej: "ABC 123")
- Moto Mercosur: 2 letras + 3 números + 1 letra (ej: "AB 123 C")
- Moto antigua: 2 letras + 3 números + 1 letra

Reglas:
- Devolvé el texto en MAYÚSCULAS, sin espacios ni guiones (ej: "AB123CD").
- Si hay varias placas, devolvé la del vehículo dominante en la imagen.
- Si no hay ninguna patente legible, devolvé cadena vacía.
- "formato" debe ser uno de: "mercosur_auto", "antiguo_auto", "mercosur_moto", "antiguo_moto", "desconocido".
- "confianza" es tu grado de certeza de 0 a 1.`;

    const llmRes = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          patente: { type: 'string' },
          formato: { type: 'string' },
          confianza: { type: 'number' },
        },
        required: ['patente', 'formato', 'confianza'],
      },
    });

    const data = llmRes || {};
    const raw = String(data.patente || '').toUpperCase();
    const patente = raw.replace(/[^A-Z0-9]/g, '');
    const val = validarPatente(patente);

    return Response.json({
      patente,
      formato_detectado: data.formato || 'desconocido',
      confianza: Number(data.confianza) || 0,
      formato: val.formato,
      valido: val.valido,
      descripcion: val.descripcion,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Validación determinística de formatos de patente argentinos (sin espacios).
function validarPatente(p) {
  if (!p) return { valido: false, formato: 'desconocido', descripcion: 'Sin patente' };
  const mercosurAuto = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;
  const antiguoAuto = /^[A-Z]{3}[0-9]{3}$/;
  const moto = /^[A-Z]{2}[0-9]{3}[A-Z]$/;
  if (mercosurAuto.test(p)) return { valido: true, formato: 'mercosur_auto', descripcion: 'Auto Mercosur (2 letras · 3 números · 2 letras)' };
  if (antiguoAuto.test(p)) return { valido: true, formato: 'antiguo_auto', descripcion: 'Auto antiguo (3 letras · 3 números)' };
  if (moto.test(p)) return { valido: true, formato: 'moto', descripcion: 'Moto (2 letras · 3 números · 1 letra)' };
  return { valido: false, formato: 'desconocido', descripcion: 'Formato no reconocido como patente argentina' };
}