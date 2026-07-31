import { base44 } from '@/api/base44Client';

// Normaliza el nombre del archivo a ASCII puro (sin tildes, eñes ni símbolos).
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

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

// Sube el archivo. Intenta primero la subida multipart directa (tipo real y,
// si falla, como octet-stream). Si ambas fallan, usa la función backend
// uploadDocumentBase64 (envía el archivo como base64) para destrabar el
// "Network Error" que el gateway produce al resetear ciertos PDFs puntuales.
export async function uploadDocument(file) {
  const { uploadFile, originalName } = prepareUploadFile(file);
  const asOctet = new File([uploadFile], uploadFile.name, { type: 'application/octet-stream' });
  const attempts = [uploadFile, asOctet];
  let multipartErr = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const res = await base44.integrations.Core.UploadFile({ file: attempts[i] });
      return { file_url: res?.file_url, originalName };
    } catch (err) {
      multipartErr = err;
      const status = err?.response?.status;
      const code = err?.code || '';
      const isNetwork = !err?.response || code === 'ERR_NETWORK' || /network/i.test(err?.message || '');
      const retriable = isNetwork || status === 403 || status === 415;
      if (!retriable || i === attempts.length - 1) break;
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  // Fallback base64 vía backend (bypass del reset de contenido del gateway)
  try {
    const dataUrl = await readFileAsDataURL(file);
    const res = await base44.functions.invoke('uploadDocumentBase64', {
      base64: dataUrl,
      filename: originalName,
      mime_type: file.type || 'application/octet-stream',
    });
    if (res?.data?.file_url) return { file_url: res.data.file_url, originalName };
    throw new Error(res?.data?.error || 'No se pudo subir el archivo');
  } catch (err) {
    // Si el fallback tampoco llegó al servidor, preservar el error original
    const fallbackNetwork = !err?.response && (/network/i.test(err?.message || '') || err?.code === 'ERR_NETWORK');
    throw fallbackNetwork && multipartErr ? multipartErr : err;
  }
}

// Mensaje de error legible que expone el estado HTTP y el cuerpo real de la
// respuesta del servidor, para diagnosticar el "Network Error"/403 genérico.
export function formatUploadError(err, file) {
  const sizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : '?';
  const status = err?.response?.status;
  let msg = err?.message || 'Error al subir el archivo';
  if (status) msg += ` (HTTP ${status})`;
  const body = err?.response?.data;
  if (body) {
    let bodyStr;
    try { bodyStr = typeof body === 'string' ? body : JSON.stringify(body); } catch { bodyStr = String(body); }
    if (bodyStr && bodyStr.length > 200) bodyStr = bodyStr.slice(0, 200) + '…';
    if (bodyStr) msg += ` · ${bodyStr}`;
  }
  msg += ` · ${sizeMB} MB`;
  return msg;
}