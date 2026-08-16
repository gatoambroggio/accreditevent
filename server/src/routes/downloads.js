import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Sirve los binarios portable del agente de impresión (.exe Windows, binarios
// macOS y el script .js de fallback) para descarga directa desde el panel.
// Público (sin auth): es una utilidad que las estaciones descargan antes de loguear.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(HERE, '..', '..');
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Busca el directorio dist en varios lugares (servidor instalado vs repo de dev).
const DIST_CANDIDATES = [
  process.env.PRINT_AGENT_DIST && path.resolve(process.env.PRINT_AGENT_DIST),
  path.join(SERVER_ROOT, 'print-agent', 'dist'),
  path.join(REPO_ROOT, 'print-agent', 'dist'),
].filter(Boolean);

const DIST = DIST_CANDIDATES.find((p) => fs.existsSync(p)) || DIST_CANDIDATES[0] || path.join(SERVER_ROOT, 'print-agent', 'dist');

const FILES = {
  'print-agent-win':     { file: 'accreditevent-print-agent.exe',       name: 'accreditevent-print-agent.exe',       type: 'application/vnd.microsoft.portable-executable' },
  'print-agent-mac-x64': { file: 'accreditevent-print-agent-mac-x64',   name: 'accreditevent-print-agent-mac-x64',   type: 'application/octet-stream' },
  'print-agent-mac-arm': { file: 'accreditevent-print-agent-mac-arm64', name: 'accreditevent-print-agent-mac-arm64', type: 'application/octet-stream' },
  'print-agent-js':      { file: 'agent.js',                            name: 'accreditevent-print-agent.js',        type: 'text/javascript' },
};

export const downloadsRouter = express.Router();

downloadsRouter.get('/:which', (req, res) => {
  const def = FILES[req.params.which];
  if (!def) return res.status(404).type('text').send('Not found');
  let resolved = path.join(DIST, def.file);
  // fallback al agent.js fuente del repo si no hay dist buildado
  if (!fs.existsSync(resolved) && def.file === 'agent.js') {
    resolved = path.join(REPO_ROOT, 'print-agent', 'agent.js');
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).type('text').send('Binario no construido. Ejecutá en print-agent: npm install && npm run build, o descargá desde GitHub Releases.');
  }
  res.setHeader('Content-Disposition', `attachment; filename="${def.name}"`);
  res.setHeader('Content-Type', def.type);
  fs.createReadStream(resolved).pipe(res);
});