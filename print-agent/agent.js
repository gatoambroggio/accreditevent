#!/usr/bin/env node
'use strict';
// =============================================================================
// AccreditEvent Print Agent
// =============================================================================
// Agente local de impresión automática. Escucha en http://127.0.0.1:9100
// y envía PDFs directamente a las impresoras del sistema operativo, sin diálogo.
//
// Uso:  node agent.js
// Sin dependencias externas — usa solo módulos built-in de Node.js.
//
// Endpoints:
//   GET  /health    → { ok, version, platform }
//   GET  /printers  → { printers: [string, ...] }
//   POST /print     → { printer, pdf_base64, copies } → { ok, printer, copies }
// =============================================================================

const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const PORTS = [9100, 9101, 9200, 9300, 4100];
const PLATFORM = process.platform;
const VERSION = '1.0.0';

// pkg empaqueta __dirname dentro de un FS de solo lectura; para escribir archivos
// (SumatraPDF.exe descargado) usamos el directorio del binario real (.exe).
const IS_PKG = __dirname.indexOf('/snapshot') === 0 ||
  process.execPath.toLowerCase().indexOf('accreditevent-print-agent') >= 0;
const APP_DIR = IS_PKG ? path.dirname(process.execPath) : __dirname;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(body);
}

// Listar impresoras disponibles en el sistema operativo
async function listPrinters() {
  if (PLATFORM === 'win32') {
    try {
      var stdout = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NoLogo', '-Command',
        'Get-Printer | Select-Object -ExpandProperty Name'
      ]);
      return stdout.stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    } catch (e) {
      return [];
    }
  } else {
    // Linux / macOS: probar varios formatos de lpstat (algunos no listan con -e)
    var found = [];
    var seen = {};
    function add(name) {
      if (name && !seen[name]) { seen[name] = true; found.push(name); }
    }
    // Intento 1: lpstat -e (destinos, uno por línea)
    try {
      var out = await execFileAsync('lpstat', ['-e']);
      out.stdout.split('\n').forEach(function (s) { add(s.trim()); });
    } catch (e) {}
    if (found.length > 0) return found;
    // Intento 2: lpstat -p ("printer NAME is ...")
    try {
      var out2 = await execFileAsync('lpstat', ['-p']);
      out2.stdout.split('\n').forEach(function (line) {
        var parts = line.trim().split(' ').filter(Boolean);
        if (parts[0] === 'printer' && parts[1]) add(parts[1]);
      });
    } catch (e) {}
    if (found.length > 0) return found;
    // Intento 3: lpstat -v ("device for NAME: ...")
    try {
      var out3 = await execFileAsync('lpstat', ['-v']);
      out3.stdout.split('\n').forEach(function (line) {
        var parts = line.trim().split(' ').filter(Boolean);
        if (parts[0] === 'device' && parts[1] === 'for' && parts[2]) {
          var name = parts[2];
          if (name.charAt(name.length - 1) === ':') name = name.slice(0, -1);
          add(name);
        }
      });
    } catch (e) {}
    if (found.length > 0) return found;
    // Intento 4: lpstat -a (primera palabra de cada línea = destino)
    try {
      var out4 = await execFileAsync('lpstat', ['-a']);
      out4.stdout.split('\n').forEach(function (line) {
        var parts = line.trim().split(' ').filter(Boolean);
        if (parts[0]) add(parts[0]);
      });
    } catch (e) {}
    return found;
  }
}

// Buscar SumatraPDF (Windows) para impresión silenciosa de PDF
function findSumatra() {
  var candidates = [
    path.join(APP_DIR, 'SumatraPDF.exe'),
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i])) return candidates[i];
    } catch (e) {}
  }
  // Buscar por nombre parcial al lado del agente (SumatraPDF-3.6.1-64.exe, etc.)
  try {
    var files = fs.readdirSync(APP_DIR);
    for (var j = 0; j < files.length; j++) {
      if (/^sumatra.*\.exe$/i.test(files[j])) return path.join(APP_DIR, files[j]);
    }
  } catch (e) {}
  return null;
}

function httpsDownload(url, dest) {
  return new Promise(function (resolve, reject) {
    var follow = function (u, depth) {
      if (depth > 5) return reject(new Error('too many redirects'));
      var lib = u.indexOf('https') === 0 ? https : http;
      var req = lib.get(u, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        var file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', function () { file.close(function () { resolve(); }); });
        file.on('error', reject);
      });
      req.on('error', reject);
    };
    follow(url, 0);
  });
}

// En air-gap el agente no puede bajar SumatraPDF de internet. Antes de probar
// la red, intenta traerlo del servidor de AccreditEvent por LAN (mismo origen
// del que se descargó este agente). Se configura con AE_SERVER_URL (ej:
// https://192.168.2.100). Si no está configurado o falla, y tampoco hay internet,
// el usuario debe colocar SumatraPDF.exe al lado del agente manualmente.
function getServerUrl() {
  return process.env.AE_SERVER_URL || '';
}

async function downloadFromServer(url, dest) {
  return new Promise(function (resolve, reject) {
    var lib = url.indexOf('https') === 0 ? https : http;
    var req = lib.get(url, function (res) {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      var file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', function () { file.close(function () { resolve(); }); });
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function ensureSumatra() {
  var existing = findSumatra();
  if (existing) return existing;
  if (PLATFORM !== 'win32') return null;
  var dest = path.join(APP_DIR, 'SumatraPDF.exe');

  // 1) Servidor AccreditEvent por LAN (air-gap friendly)
  var serverUrl = getServerUrl();
  if (serverUrl) {
    try {
      console.log('Buscando SumatraPDF en el servidor AccreditEvent (' + serverUrl + ')...');
      await downloadFromServer(serverUrl.replace(/\/$/, '') + '/api/downloads/sumatrapdf', dest);
      if (fs.existsSync(dest)) { console.log('SumatraPDF descargado del servidor: ' + dest); return dest; }
    } catch (e) {
      console.error('No se pudo bajar SumatraPDF del servidor: ' + e.message);
    }
  }

  // 2) Internet (funciona solo si la estación tiene salida a internet)
  var zipPath = path.join(os.tmpdir(), 'sumatra-portable.zip');
  try {
    console.log('Descargando SumatraPDF portable...');
    await httpsDownload('https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip', zipPath);
    try {
      await execFileAsync('tar', ['-xf', zipPath, '-C', APP_DIR]);
    } catch (e) {
      await execFileAsync('powershell.exe', ['-NoProfile', '-Command', "Expand-Archive -Path '" + zipPath + "' -DestinationPath '" + APP_DIR + "' -Force"]);
    }
    try { fs.unlinkSync(zipPath); } catch (e) {}
    if (fs.existsSync(dest)) { console.log('SumatraPDF instalado en ' + dest); return dest; }
  } catch (e) {
    console.error('No se pudo descargar SumatraPDF de internet: ' + e.message);
    try { fs.unlinkSync(zipPath); } catch (x) {}
  }
  console.error('==== MODO AIR-GAP ====');
  console.error('SumatraPDF no está disponible. Para imprimir en Windows necesitás:');
  console.error('  Opción A (rápida): descargá SumatraPDF.exe desde el panel de AccreditEvent');
  console.error('    (Configuración → Impresión → "SumatraPDF (Windows)") y ponelo al lado');
  console.error('    de accreditevent-print-agent.exe en la estación.');
  console.error('  Opción B (auto):  set AE_SERVER_URL=https://192.168.2.100  antes de');
  console.error('    ejecutar el agente, y subí SumatraPDF.exe al servidor en');
  console.error('    /opt/accreditevent/server/print-agent/dist/SumatraPDF.exe');
  console.error('=======================');
  return null;
}

// Enviar PDF a la impresora
async function printPDF(filePath, printer, copies) {
  copies = Math.max(1, Math.min(copies || 1, 99));

  if (PLATFORM === 'win32') {
    // Windows: usar SumatraPDF (impresión silenciosa de PDF)
    var sumatra = await ensureSumatra();
    if (!sumatra) throw new Error('No se pudo obtener SumatraPDF (sin internet). Descargalo de sumatrapdfreader.org y ponelo junto al agente.');
    var args = ['-print-to', printer, '-silent', '-nosplash', '-exit-when-done'];
    if (copies > 1) args.push('-print-settings', String(copies) + 'x');
    args.push(filePath);
    await execFileAsync(sumatra, args);
  } else {
    // Linux / macOS: usar lp (CUPS)
    var lpArgs = ['-d', printer, '-n', String(copies), filePath];
    await execFileAsync('lp', lpArgs);
  }
}

var server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, { ok: true, version: VERSION, platform: PLATFORM, hostname: os.hostname() });
    return;
  }

  if (req.method === 'GET' && req.url === '/printers') {
    listPrinters()
      .then(function (printers) { sendJSON(res, 200, { printers: printers }); })
      .catch(function (err) { sendJSON(res, 500, { error: err.message, printers: [] }); });
    return;
  }

  if (req.method === 'GET' && req.url === '/debug') {
    var debug = { platform: PLATFORM, printers: null, raw: {} };
    listPrinters()
      .then(function (printers) { debug.printers = printers; })
      .catch(function (e) { debug.printers_error = e.message; })
      .then(function () {
        var tasks = [];
        if (PLATFORM === 'win32') {
          tasks.push(execFileAsync('powershell.exe', ['-NoProfile', '-NoLogo', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name']).then(function (o) { debug.raw.powershell_getprinter = o; }).catch(function (e) { debug.raw.powershell_getprinter = 'ERROR: ' + e.message; }));
        } else {
          tasks.push(execFileAsync('lpstat', ['-e']).then(function (o) { debug.raw.lpstat_e = o; }).catch(function (e) { debug.raw.lpstat_e = 'ERROR: ' + e.message; }));
          tasks.push(execFileAsync('lpstat', ['-p']).then(function (o) { debug.raw.lpstat_p = o; }).catch(function (e) { debug.raw.lpstat_p = 'ERROR: ' + e.message; }));
          tasks.push(execFileAsync('lpstat', ['-v']).then(function (o) { debug.raw.lpstat_v = o; }).catch(function (e) { debug.raw.lpstat_v = 'ERROR: ' + e.message; }));
          tasks.push(execFileAsync('lpstat', ['-a']).then(function (o) { debug.raw.lpstat_a = o; }).catch(function (e) { debug.raw.lpstat_a = 'ERROR: ' + e.message; }));
        }
        Promise.all(tasks).then(function () { sendJSON(res, 200, debug); });
      });
    return;
  }

  if (req.method === 'POST' && req.url === '/print') {
    var body = '';
    req.on('data', function (chunk) {
      body += chunk;
      if (body.length > 50e6) req.destroy();
    });
    req.on('end', function () {
      try {
        var payload = JSON.parse(body);
        var printer = payload.printer;
        var pdf_base64 = payload.pdf_base64;
        var copies = payload.copies || 1;
        if (!printer) { sendJSON(res, 400, { error: 'Falta printer' }); return; }
        if (!pdf_base64) { sendJSON(res, 400, { error: 'Falta pdf_base64' }); return; }

        var tmpFile = path.join(os.tmpdir(), 'accreditevent_' + Date.now() + '.pdf');
        var base64Data = pdf_base64.indexOf(',') >= 0 ? pdf_base64.split(',')[1] : pdf_base64;
        fs.writeFileSync(tmpFile, Buffer.from(base64Data, 'base64'));

        printPDF(tmpFile, printer, copies)
          .then(function () {
            fs.unlink(tmpFile, function () {});
            sendJSON(res, 200, { ok: true, printer: printer, copies: copies });
          })
          .catch(function (err) {
            fs.unlink(tmpFile, function () {});
            sendJSON(res, 500, { error: err.message });
          });
      } catch (err) {
        sendJSON(res, 500, { error: err.message });
      }
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

function tryListen(srv, port) {
  return new Promise(function (resolve, reject) {
    srv.once('listening', function () { resolve(port); });
    srv.once('error', function (err) { reject(err); });
    srv.listen(port, '127.0.0.1');
  });
}

(function () {
  var idx = 0;
  function next() {
    if (idx >= PORTS.length) {
      console.error('No se pudo escuchar en ningún puerto de la lista: ' + PORTS.join(', '));
      console.error('En Windows el puerto 9100 puede estar reservado por Hyper-V/WSL.');
      console.error('Ejecutá como admin o liberá el puerto con: net stop winnat & net start winnat');
      process.exit(1);
      return;
    }
    var p = PORTS[idx++];
    tryListen(server, p).then(function () {
      console.log('AccreditEvent Print Agent escuchando en http://127.0.0.1:' + p);
      console.log('Plataforma: ' + PLATFORM);
      if (PLATFORM === 'win32') {
        var sumatra = findSumatra();
        if (sumatra) {
          console.log('SumatraPDF: ' + sumatra);
        } else {
          console.log('SumatraPDF no encontrado. Buscando (servidor LAN / internet)...');
          ensureSumatra().then(function (s) {
            if (s) console.log('SumatraPDF listo: ' + s);
            else console.log('SumatraPDF no disponible. Mirá las instrucciones de arriba (modo air-gapped).');
          }).catch(function (e) { console.error('Error buscando SumatraPDF: ' + e.message); });
        }
      } else {
        console.log('Usando: lp (CUPS)');
      }
      console.log('Presiona Ctrl+C para detener.');
    }).catch(function (err) {
      console.error('No se pudo usar el puerto ' + p + ' (' + (err.code || err.message) + ') — probando otro...');
      next();
    });
  }
  next();
})();