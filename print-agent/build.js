#!/usr/bin/env node
'use strict';
// =============================================================================
// Build portable executables del AccreditEvent Print Agent.
// =============================================================================
// Genera binarios standalone (Node embebido) para que las estaciones de trabajo
// NO necesiten instalar Node.js:
//   - Windows:      dist/accreditevent-print-agent.exe        (doble clic para correr)
//   - macOS Intel:  dist/accreditevent-print-agent-mac-x64
//   - macOS Apple Silicon: dist/accreditevent-print-agent-mac-arm64
//
// Requiere internet una sola vez (para que @yao-pkg/pkg baje los binarios de Node
// por plataforma). En el servidor air-gapped NO se construye: los binarios ya
// compilados se copian a print-agent/dist/ y install.sh los sirve desde el panel.
//
// Uso:
//   npm install        (instala @yao-pkg/pkg)
//   npm run build      (todos los targets)
//   npm run build:win  (solo Windows)
//   npm run build:mac  (solo macOS x64 + arm64)
// =============================================================================

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
fs.mkdirSync(DIST, { recursive: true });

const TARGETS = {
  win:    { target: 'node20-win-x64',     out: 'accreditevent-print-agent.exe' },
  macx64: { target: 'node20-macos-x64',   out: 'accreditevent-print-agent-mac-x64' },
  macarm: { target: 'node20-macos-arm64', out: 'accreditevent-print-agent-mac-arm64' },
};

function buildOne(key) {
  const { target, out } = TARGETS[key];
  console.log(`\n▶ Building ${key} (${target}) → dist/${out}`);
  const res = spawnSync('npx', [
    '@yao-pkg/pkg', 'agent.js',
    '-t', target,
    '-o', path.join('dist', out),
    '--compress', 'GZip',
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) { console.error(`✗ Falló ${key}`); process.exit(res.status || 1); }
  const full = path.join(DIST, out);
  if (!fs.existsSync(full)) { console.error(`✗ No se generó dist/${out}`); process.exit(1); }
  // macOS: asegurar bit de ejecutable (pkg lo deja sin x por defecto)
  if (out.indexOf('mac') >= 0) { try { fs.chmodSync(full, 0o755); } catch (e) {} }
  console.log(`✓ dist/${out}`);
}

const arg = process.argv[2] || 'all';
if (arg === 'all')      { buildOne('win'); buildOne('macx64'); buildOne('macarm'); }
else if (arg === 'win') { buildOne('win'); }
else if (arg === 'mac') { buildOne('macx64'); buildOne('macarm'); }
else                    { buildOne(arg); }

console.log('\n✅ Build completo. Binarios en print-agent/dist/');
console.log('   Copiá print-agent/dist/ al servidor y corré install.sh para servirlos desde el panel.');