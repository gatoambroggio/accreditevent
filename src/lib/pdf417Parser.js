// Parser del string PDF417 del DNI argentino. Robusto por patrones: clasifica
// cada campo por su formato intrínseco (trámite, DNI, fecha, sexo, ejemplar,
// nombres) en vez de asumir un orden fijo de campos. Así soporta los dos
// formatos vigentes — el RENAPER canónico (trámite al final) y la variante con
// trámite al inicio — y no confunde un DNI con una fecha.
//
// RENAPER canónico:
//   @APELLIDO@NOMBRE@SEXO@NACIONALIDAD@DNI@EJEMPLAR@FECHA_NAC@FECHA_EMISION@TRAMITE@@@
// Variante (trámite al inicio):
//   @TRAMITE@APELLIDO@NOMBRE@SEXO@DNI@EJEMPLAR@FECHA_NAC@FECHA_EMISION@...

function isDate8(s) {
  if (!/^\d{8}$/.test(s)) return false;
  const dd = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  const yyyy = parseInt(s.slice(4, 8), 10);
  // El año debe ser plausible: esto evita clasificar un DNI (p.ej. 30126892,
  // que "parece" 30/12/6892) como fecha.
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 1900 && yyyy <= 2099;
}

function toDateISO(d) {
  if (!/^\d{8}$/.test(d)) return '';
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

function toDateFmt(d) {
  if (!/^\d{8}$/.test(d)) return '';
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
}

const SEXO_LABELS = { M: 'Masculino', F: 'Femenino', X: 'No binario' };
const SEXOS = new Set(['M', 'F', 'X']);
const EJEMPLARES = new Set(['A', 'B', 'C']);
const isName = (s) => /^[A-ZÁÉÍÓÚÑÜ\s'.-]{2,}$/i.test(s) && /[a-záéíóúñ]/i.test(s);

export function parsePdf417(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.replace(/[\r\n\t]/g, '').trim();
  if (!text) return null;

  const parts = text.split('@').map((p) => p.trim());
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  if (parts.length && parts[0] === '') parts.shift(); // leading '@'
  if (parts.length === 0) return null;

  let apellido = '', nombre = '', sexo = '', nacionalidad = '';
  let dni = '', ejemplar = '', tramite = '';
  const fechas = [];
  const nombres = [];

  for (const p of parts) {
    if (!p) continue;
    // Trámite: 9+ dígitos (el RENAPER usa 11; aceptamos rango por robustez).
    if (/^\d{9,}$/.test(p)) { if (!tramite) tramite = p; continue; }
    // DNI: 7-8 dígitos que NO son una fecha válida (para no confundir con fecha).
    if (/^\d{7,8}$/.test(p) && !isDate8(p)) { if (!dni) dni = p; continue; }
    // Fecha: 8 dígitos con fecha válida y año plausible.
    if (isDate8(p)) { fechas.push(p); continue; }
    // Fecha con barras (DD/MM/YYYY): normalizar a DDMMAAAA antes de validar.
    const slash = p.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slash) { const norm = `${slash[1]}${slash[2]}${slash[3]}`; if (isDate8(norm)) { fechas.push(norm); continue; } }
    // Sexo: un único char M/F/X.
    if (p.length === 1 && SEXOS.has(p.toUpperCase())) { sexo = p.toUpperCase(); continue; }
    // Ejemplar: un único char A/B/C.
    if (p.length === 1 && EJEMPLARES.has(p.toUpperCase())) { ejemplar = p.toUpperCase(); continue; }
    // Resto: nombres/apellidos/nacionalidad (texto). Se asignan en orden:
    // 1º apellido, 2º nombre, 3º+ nacionalidad.
    if (isName(p)) nombres.push(p);
  }

  if (nombres.length >= 1) apellido = nombres[0];
  if (nombres.length >= 2) nombre = nombres[1];
  if (nombres.length >= 3) nacionalidad = nombres.slice(2).join(' ');

  const fechaNac = fechas[0] || '';
  const fechaEmision = fechas[1] || '';

  return {
    apellido,
    nombre,
    sexo,
    sexo_label: SEXO_LABELS[sexo] || sexo || '',
    nacionalidad,
    fecha_nacimiento: fechaNac,
    fecha_nacimiento_iso: toDateISO(fechaNac),
    fecha_nacimiento_fmt: toDateFmt(fechaNac),
    dni,
    ejemplar,
    fecha_emision: fechaEmision,
    fecha_emision_iso: toDateISO(fechaEmision),
    fecha_emision_fmt: toDateFmt(fechaEmision),
    tramite,
    raw: text,
  };
}