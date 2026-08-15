// HTTP Digest auth (MD5) + helpers CGI para terminales Dahua (face access control).
// Las terminales Dahua (serie ASI/FACT) exponen una API HTTP CGI protegida con
// autenticación Digest estándar (RFC 2617). No hay SDK oficial usable desde un
// edge function, así que implementamos MD5 + Digest a mano (Web Crypto no
// soporta MD5).

/* ---------- MD5 (implementación pura, blueimp-md5 style) ---------- */
function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}
function bitRol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
function cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
function binlMD5(x, len) {
  x[len >> 5] |= 0x80 << (len % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
  }
  return [a, b, c, d];
}
function binl2rstr(input) {
  let output = '';
  for (let i = 0; i < input.length * 32; i += 8) output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff);
  return output;
}
function rstr2binl(input) {
  const output = Array(input.length >> 2).fill(0);
  for (let i = 0; i < input.length * 8; i += 8) output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32);
  return output;
}
function rstrMD5(s) { return binl2rstr(binlMD5(rstr2binl(s), s.length * 8)); }
function rstr2hex(input) {
  const hex = '0123456789abcdef';
  let output = '';
  for (let i = 0; i < input.length; i++) {
    const x = input.charCodeAt(i);
    output += hex.charAt((x >>> 4) & 0x0f) + hex.charAt(x & 0x0f);
  }
  return output;
}
function str2rstrUTF8(input) { return unescape(encodeURIComponent(input)); }
export function md5(str) { return rstr2hex(rstrMD5(str2rstrUTF8(str))); }

/* ---------- Digest auth ---------- */
function parseDigestHeader(header) {
  const params: Record<string, string> = {};
  const m = header.replace(/^Digest\s+/i, '');
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|([^,]+))/g;
  let match;
  while ((match = re.exec(m)) !== null) {
    params[match[1].toLowerCase()] = match[2] || match[3].trim();
  }
  return params;
}

function buildAuthHeader(username, dp, uri, response, nc, cnonce, qop) {
  let h = `Digest username="${username}", realm="${dp.realm}", nonce="${dp.nonce}", uri="${uri}", response="${response}"`;
  if (qop) h += `,qop=${qop},nc=${nc},cnonce="${cnonce}"`;
  if (dp.algorithm) h += `,algorithm=${dp.algorithm}`;
  return h;
}

export interface DahuaResult {
  ok: boolean;
  status: number;
  text: string;
}

// Ejecuta una petición CGI a la terminal Dahua con autenticación Digest.
// opts: { method, headers, body }
export async function dahuaRequest(device, path, opts: any = {}): Promise<DahuaResult> {
  const base = `http://${device.ip}:${device.port || 80}`;
  const url = base + path;
  const method = (opts.method || 'GET').toUpperCase();

  const makeHeaders = (auth) => {
    const h: Record<string, string> = { ...(opts.headers || {}) };
    if (auth) h['Authorization'] = auth;
    if (opts.body && !h['Content-Type']) h['Content-Type'] = 'application/x-www-form-urlencoded';
    return h;
  };

  let res = await fetch(url, { method, headers: makeHeaders(null), body: opts.body });
  if (res.status !== 401) {
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  }

  const www = res.headers.get('WWW-Authenticate') || '';
  const dp = parseDigestHeader(www);
  if (!dp.nonce) throw new Error('La terminal no devolvió challenge Digest');

  const ha1 = md5(`${device.username}:${dp.realm}:${device.password}`);
  const ha2 = md5(`${method}:${path}`);
  const nc = '00000001';
  const cnonce = Math.random().toString(16).slice(2, 10);
  const qop = dp.qop ? dp.qop.split(',')[0].trim() : '';
  const response = qop ? md5(`${ha1}:${dp.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${dp.nonce}:${ha2}`);

  res = await fetch(url, { method, headers: makeHeaders(buildAuthHeader(device.username, dp, path, response, nc, cnonce, qop)), body: opts.body });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/* ---------- Helpers CGI de control de acceso ---------- */
function enc(s) { return encodeURIComponent(String(s || '')); }

// Crea/actualiza un usuario en la terminal. UserID = badge_code o DNI.
export async function storeAccessUser(device, userId, userName) {
  const path = `/cgi-bin/accessControl.cgi?action=storeAccessUser&UserID=${enc(userId)}&UserName=${enc(userName)}&UserRole=0&UserType=0&Door=1&TimeSection=0000000100000000`;
  return dahuaRequest(device, path);
}

// Elimina un usuario (y su rostro asociado).
export async function deleteAccessUser(device, userId) {
  const path = `/cgi-bin/accessControl.cgi?action=deleteAccessUser&UserID=${enc(userId)}`;
  return dahuaRequest(device, path);
}

// Sube la foto de rostro de un usuario (multipart). imageUrl es una URL pública
// de la foto (Biometric.face_photo_url). Best-effort: si falla, el usuario igual
// queda creado y puede usar tarjeta/PIN.
export async function storeFace(device, userId, imageBytes, mime = 'image/jpeg') {
  const boundary = '----dahuaFace' + Math.random().toString(16).slice(2);
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="Face"; filename="face.jpg"\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const body = new Uint8Array(headBytes.length + imageBytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(imageBytes, headBytes.length);
  body.set(tailBytes, headBytes.length + imageBytes.length);

  const path = `/cgi-bin/faceManager.cgi?action=storeFace&UserID=${enc(userId)}`;
  return dahuaRequest(device, path, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

// Apertura remota de puerta.
export async function openDoor(device, channel = 0) {
  const path = `/cgi-bin/accessControl.cgi?action=ControlDevice&command=open&channel=${channel}&Type=Remote`;
  return dahuaRequest(device, path);
}

// Reinicia la terminal.
export async function rebootDevice(device) {
  const path = `/cgi-bin/magicBox.cgi?action=reboot`;
  return dahuaRequest(device, path);
}

// Lista los UserIDs almacenados en la terminal (para reconciliación).
export async function getAllUserIds(device) {
  const path = `/cgi-bin/accessControl.cgi?action=getAllUserID`;
  const r = await dahuaRequest(device, path);
  // Respuesta en formato clave=valor:UserID=1\nUserID=2\n...
  const ids = r.text.split('\n').map((l) => l.split('=')[1]).filter(Boolean);
  return { ...r, ids };
}

// Estado/info del dispositivo (para verificar conectividad + último error).
export async function getDeviceStatus(device) {
  const path = `/cgi-bin/magicBox.cgi?action=getSystemInfo`;
  return dahuaRequest(device, path);
}