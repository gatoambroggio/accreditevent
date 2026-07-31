// Algunos gateways/proxies rechazan nombres de archivo con caracteres no-ASCII
// (tildes, eñes) en multipart/form-data y devuelven un "Network Error" genérico.
// Normalizamos el nombre a ASCII para la subida, pero conservamos el nombre
// original para guardarlo en el registro del documento.
export function prepareUploadFile(file) {
  const safeName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diacríticos
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadFile = safeName === file.name
    ? file
    : new File([file], safeName, { type: file.type || 'application/octet-stream' });
  return { uploadFile, originalName: file.name };
}