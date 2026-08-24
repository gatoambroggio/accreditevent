// Parser del string PDF417 del DNI argentino (formato RENAPER delimitado por "@").
// Espejo del parser del frontend (src/lib/pdf417Parser.js) — separado porque el
// servidor y el cliente son builds distintos. Devuelve los campos estructurados.
//
// Estructura canónica (con "@" inicial):
//   @APELLIDO@NOMBRE@SEXO@NACIONALIDAD@FECHA_NAC(DDMMAAAA)@DNI@EJEMPLAR@FECHA_EMISION(DDMMAAAA)@TRAMITE@@@

function isDate8(s) {
  if (!/^\d{8}$/.test(s)) return false;
  const dd = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
}
function toDateISO(d) { return /^\d{8}$/.test(d) ? `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : ''; }
function toDateFmt(d) { return /^\d{8}$/.test(d) ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}` : ''; }
const SEXO_LABELS = { M: 'Masculino', F: 'Femenino' };

export function parsePdf417(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.replace(/[\r\n\t]/g, '').trim();
  if (!text) return null;
  const parts = text.split('@').map((p) => p.trim());
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  if (parts.length === 0) return null;
  const off = parts[0] === '' ? 1 : 0;
  const get = (i) => (parts[off + i] != null ? parts[off + i] : '');
  let apellido = get(0), nombre = get(1), sexo = get(2), nacionalidad = get(3);
  let fechaNac = get(4), dni = get(5), ejemplar = get(6), fechaEmision = get(7), tramite = get(8);
  const isDniLike = (s) => /^\d{6,8}$/.test(s) && !isDate8(s);
  if (!isDniLike(dni)) { const cand = parts.find((p) => isDniLike(p)); if (cand) dni = cand; }
  return {
    apellido, nombre, sexo, sexo_label: SEXO_LABELS[sexo] || sexo || '', nacionalidad,
    fecha_nacimiento: fechaNac, fecha_nacimiento_iso: toDateISO(fechaNac), fecha_nacimiento_fmt: toDateFmt(fechaNac),
    dni, ejemplar, fecha_emision: fechaEmision, fecha_emision_iso: toDateISO(fechaEmision), fecha_emision_fmt: toDateFmt(fechaEmision),
    tramite, raw: text,
  };
}