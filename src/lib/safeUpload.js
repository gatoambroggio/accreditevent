import { base44 } from '@/api/base44Client';

// Normaliza el nombre del archivo a ASCII puro (sin tildes, eñes ni símbolos).
// Si después de normalizar queda vacío o con caracteres inválidos, usa un
// nombre genérico. El gateway rechaza filenames no-ASCII con "Network Error".
export function prepareUploadFile(file) {
  const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || '';
  const safe = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const finalName = safe && /^[a-zA-Z0-9._-]+$/.test(safe)
    ? safe
    : `doc_${Date.now()}${ext ? '.' + ext.toLowerCase() : ''}`;
  const type = file.type || (ext.toLowerCase() === 'pdf' ? 'application/pdf' : 'application/octet-stream');
  const uploadFile = finalName === file.name && type === file.type
    ? file
    : new File([file], finalName, { type });
  return { uploadFile, originalName: file.name };
}

// Sube el archivo con hasta 3 intentos cuando el error es de red
// (los "Network Error" transitorios son comunes en subidas multipart).
export async function uploadDocument(file) {
  const { uploadFile, originalName } = prepareUploadFile(file);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await base44.integrations.Core.UploadFile({ file: uploadFile });
      return { file_url: res?.file_url, originalName };
    } catch (err) {
      lastErr = err;
      const code = err?.code || '';
      const isNetwork = !err?.response || code === 'ERR_NETWORK' || /network/i.test(err?.message || '');
      if (!isNetwork || attempt >= 2) break;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// Mensaje de error legible que expone el estado HTTP y el tamaño del archivo
// para diagnosticar el "Network Error" genérico de axios.
export function formatUploadError(err, file) {
  const sizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : '?';
  const status = err?.response?.status;
  const apiDetail = err?.response?.data?.detail || err?.response?.data?.message || '';
  let msg = err?.message || 'Error al subir el archivo';
  if (status) msg += ` (HTTP ${status})`;
  if (apiDetail) msg += ` · ${apiDetail}`;
  msg += ` · ${sizeMB} MB`;
  return msg;
}