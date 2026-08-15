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
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const PORTS = [9100, 9101, 9200, 9300, 4100];
const PLATFORM = process.platform;
const VERSION = '1.0.0';

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
      return stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
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
      out.split('\n').forEach(function (s) { add(s.trim()); });
    } catch (e) {}
    if (found.length > 0) return found;
    // Intento 2: lpstat -p ("printer NAME is ...")
    try {
      var out2 = await execFileAsync('lpstat', ['-p']);
      out2.split('\n').forEach(function (line) {
        var parts = line.trim().split(' ').filter(Boolean);
        if (parts[0] === 'printer' && parts[1]) add(parts[1]);
      });
    } catch (e) {}
    if (found.length > 0) return found;
    // Intento 3: lpstat -v ("device for NAME: ...")
    try {
      var out3 = await execFileAsync('lpstat', ['-v']);
      out3.split('\n').forEach(function (line) {
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
      out4.split('\n').forEach(function (line) {
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
    path.join(__dirname, 'SumatraPDF.exe'),
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (fs.existsSync(candidates[i])) return candidates[i];
    } catch (e) {}
  }
  return null;
}

// Enviar PDF a la impresora
async function printPDF(filePath, printer, copies) {
  copies = Math.max(1, Math.min(copies || 1, 99));

  if (PLATFORM === 'win32') {
    // Windows: usar SumatraPDF (impresión silenciosa de PDF)
    var sumatra = findSumatra() || 'SumatraPDF.exe';
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
    var debug = { platform: PLATFORM, lpstat_e: null, lpstat_p: null, lpstat_v: null, lpstat_a: null };
    var tasks = [];
    tasks.push(execFileAsync('lpstat', ['-e']).then(function(o) { debug.lpstat_e = o; }).catch(function(e) { debug.lpstat_e = 'ERROR: ' + e.message; }));
    tasks.push(execFileAsync('lpstat', ['-p']).then(function(o) { debug.lpstat_p = o; }).catch(function(e) { debug.lpstat_p = 'ERROR: ' + e.message; }));
    tasks.push(execFileAsync('lpstat', ['-v']).then(function(o) { debug.lpstat_v = o; }).catch(function(e) { debug.lpstat_v = 'ERROR: ' + e.message; }));
    tasks.push(execFileAsync('lpstat', ['-a']).then(function(o) { debug.lpstat_a = o; }).catch(function(e) { debug.lpstat_a = 'ERROR: ' + e.message; }));
    Promise.all(tasks).then(function() { sendJSON(res, 200, debug); });
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
          console.log('ADVERTENCIA: SumatraPDF no encontrado. Ver README.md (Windows).');
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