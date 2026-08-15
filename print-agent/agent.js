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
const PORT = 9100;
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
    try {
      var out = await execFileAsync('lpstat', ['-e']);
      return out.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    } catch (e) {
      return [];
    }
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

server.listen(PORT, '127.0.0.1', function () {
  console.log('AccreditEvent Print Agent escuchando en http://127.0.0.1:' + PORT);
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
});