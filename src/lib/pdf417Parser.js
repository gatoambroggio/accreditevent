// Parser del string PDF417 del reverso del DNI argentino (formato RENAPER
// delimitado por "@"). Devuelve los campos estructurados. Es defensivo:
// acepta con o sin "@" inicial, con o sin "@" finales, y localiza el DNI si la
// posición canónica no coincide.
//
// Estructura canónica (con "@" inicial):
//   @APELLIDO@NOMBRE@SEXO@NACIONALIDAD@FECHA_NAC(DDMMAAAA)@DNI@EJEMPLAR@FECHA_EMISION(DDMMAAAA)@TRAMITE@@@

function isDate8(s) {
  if (!/^\d{8}$/.test(s)) return false;
  const dd = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
}

function toDateISO(d) {
  if (!/^\d{8}$/.test(d)) return '';
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

function toDateFmt(d) {
  if (!/^\d{8}$/.test(d)) return '';
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
}

const SEXO_LABELS = { M: 'Masculino', F: 'Femenino' };

export function parsePdf417(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Limpieza: algunos lectores devuelven control chars / espacios.
  const text = raw.replace(/[\r\n\t]/g, '').trim();
  if (!text) return null;

  const parts = text.split('@').map((p) => p.trim());
  // Quitar colas vacías (los "@@@" finales).
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  if (parts.length === 0) return null;

  // Offset: si arranca con "@" (parts[0]==='') los datos empiezan en índice 1.
  const off = parts[0] === '' ? 1 : 0;
  const get = (i) => (parts[off + i] != null ? parts[off + i] : '');

  let apellido = get(0);
  let nombre = get(1);
  let sexo = get(2);
  let nacionalidad = get(3);
  let fechaNac = get(4);
  let dni = get(5);
  let ejemplar = get(6);
  let fechaEmision = get(7);
  let tramite = get(8);

  // Validación del DNI: la posición canónica debe ser numérica (6-8 dígitos)
  // y no confundirse con una fecha. Si no, lo buscamos en todo el string.
  const isDniLike = (s) => /^\d{6,8}$/.test(s) && !isDate8(s);
  if (!isDniLike(dni)) {
    const cand = parts.find((p) => isDniLike(p));
    if (cand) dni = cand;
  }

  // Normaliza fechas que vengan como 7 dígitos (raro) — las dejamos como están.

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