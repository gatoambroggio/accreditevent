// Módulo de actualización del sistema (sólo superadmin). Permite subir un ZIP
// con el nuevo código (o hacer pull desde un Git interno de la LAN) y aplicarlo
// al servidor air-gapped: respaldo, descompresión, npm install, migraciones de
// Prisma, build del frontend y reinicio de servicios. Todo queda registrado en
// un state.json con log paso a paso que el panel consulta por polling.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { requireRole } from '../auth/middleware.js';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../../..');
const UPDATES_DIR = path.join(APP_ROOT, 'updates');
const BACKUPS_DIR = path.join(APP_ROOT, 'backups');
const STATE_FILE = path.join(UPDATES_DIR, 'state.json');
const PM2_APP = process.env.PM2_APP_NAME || 'accreditevent';

fs.mkdirSync(UPDATES_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

export const updatesRouter = express.Router();
updatesRouter.use(requireRole('superadmin'));

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function writeState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}
function currentVersion() {
  try { return fs.readFileSync(path.join(APP_ROOT, 'VERSION'), 'utf8').trim(); } catch {}
  try { const p = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')); return p.version || '—'; } catch {}
  return '—';
}
function log(state, msg, level = 'info') {
  state.log = state.log || [];
  state.log.push({ t: new Date().toISOString(), level, msg });
  state.lastStep = msg;
  writeState(state);
}
async function run(cmd, args, opts = {}) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: opts.timeout || 180000, maxBuffer: 10 * 1024 * 1024, cwd: opts.cwd });
    return ((stdout || '') + (stderr ? `\n[stderr] ${stderr}` : '')).trim();
  } catch (e) {
    throw new Error((e.stderr || e.stdout || e.message || '').toString().slice(0, 600));
  }
}

async function buildAndRestart(state) {
  // 4. npm install server
  log(state, 'Instalando dependencias del servidor…');
  try { await run('npm', ['install', '--omit=dev'], { cwd: path.join(APP_ROOT, 'server'), timeout: 600000 }); log(state, 'Dependencias del servidor listas.'); }
  catch (e) { log(state, 'npm install servidor: ' + e.message, 'error'); throw e; }

  // 5. prisma generate + migrate
  log(state, 'Generando cliente Prisma…');
  try { await run('npx', ['prisma', 'generate'], { cwd: path.join(APP_ROOT, 'server'), timeout: 240000 }); }
  catch (e) { log(state, 'prisma generate: ' + e.message, 'error'); throw e; }
  log(state, 'Aplicando migraciones de base de datos…');
  try { await run('npx', ['prisma', 'migrate', 'deploy'], { cwd: path.join(APP_ROOT, 'server'), timeout: 240000 }); log(state, 'Migraciones aplicadas.'); }
  catch (e) { log(state, 'prisma migrate: ' + e.message, 'error'); throw e; }

  // 6. npm install + build frontend
  log(state, 'Instalando dependencias del frontend…');
  try { await run('npm', ['install'], { cwd: APP_ROOT, timeout: 600000 }); }
  catch (e) { log(state, 'npm install frontend: ' + e.message, 'error'); throw e; }
  log(state, 'Compilando frontend (vite build)…');
  try { await run('npm', ['run', 'build'], { cwd: APP_ROOT, timeout: 600000 }); log(state, 'Frontend compilado.'); }
  catch (e) { log(state, 'build frontend: ' + e.message, 'error'); throw e; }

  // 7. completado
  state.status = 'completed';
  state.finishedAt = new Date().toISOString();
  state.version = currentVersion();
  writeState(state);
  log(state, 'Actualización completada. Reiniciando servicios…');

  // 8. reiniciar PM2 (best effort)
  try { await run('pm2', ['reload', PM2_APP], { timeout: 30000 }); }
  catch {
    try { await run('pm2', ['restart', PM2_APP], { timeout: 30000 }); }
    catch (e) { log(state, 'pm2 restart: ' + e.message + ' (reiniciá el servicio manualmente)', 'warn'); }
  }
  // nginx reload (best effort; suele requerir sudo)
  try { await run('nginx', ['-s', 'reload'], { timeout: 15000 }); }
  catch (e) { log(state, 'nginx reload: ' + e.message + ' (ejecutá sudo nginx -s reload manualmente)', 'warn'); }
}

async function applyFromStaging(stagingDir, state) {
  // 1. Backup del código actual (excluye node_modules, backups, updates, uploads).
  log(state, 'Respaldando código actual…');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `backup-${ts}.tar.gz`);
  try {
    await run('tar', ['czf', backupFile, '--exclude=node_modules', '--exclude=backups', '--exclude=updates', '--exclude=uploads', '-C', APP_ROOT, '.'], { timeout: 300000 });
    state.backupFile = backupFile;
    state.prevVersion = currentVersion();
    writeState(state);
    log(state, `Backup creado: ${path.basename(backupFile)}`);
  } catch (e) {
    log(state, 'Backup falló: ' + e.message, 'error'); throw e;
  }

  // 2. Resolver la raíz del staging (si el zip trae una carpeta única adentro).
  let src = stagingDir;
  const entries = fs.readdirSync(stagingDir);
  if (entries.length === 1) {
    const only = path.join(stagingDir, entries[0]);
    if (fs.statSync(only).isDirectory()) src = only;
  }

  // 3. Sincronizar el nuevo código sobre APP_ROOT (preserva .env, uploads, etc.).
  log(state, 'Instalando nuevo código…');
  const excludes = ['.env', 'uploads', 'node_modules', 'backups', 'updates', 'server/.env', '.git'];
  const rsyncArgs = ['-a', '--delete'];
  excludes.forEach((e) => rsyncArgs.push('--exclude', e));
  rsyncArgs.push(src + '/', APP_ROOT + '/');
  try {
    await run('rsync', rsyncArgs, { timeout: 300000 });
  } catch {
    log(state, 'rsync no disponible, copiando con cp…', 'warn');
    try { await run('cp', ['-a', src + '/.', APP_ROOT + '/'], { timeout: 300000 }); }
    catch (e) { log(state, 'cp falló: ' + e.message, 'error'); throw e; }
  }
  log(state, 'Código instalado.');

  await buildAndRestart(state);
}

function startUpdate(kind, stagingDir) {
  const state = { status: 'running', step: 'init', kind, startedAt: new Date().toISOString(), log: [], version: currentVersion() };
  writeState(state);
  applyFromStaging(stagingDir, state).catch((e) => {
    state.status = 'failed';
    state.error = e.message;
    state.finishedAt = new Date().toISOString();
    log(state, 'Actualización fallida: ' + e.message, 'error');
    writeState(state);
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
  });
}

// ---- Estado actual + versión ----
updatesRouter.get('/status', (req, res) => {
  res.json({ data: { state: readState(), currentVersion: currentVersion() } });
});

// ---- Subir ZIP (raw body application/zip) ----
updatesRouter.post('/upload', express.raw({ type: 'application/zip', limit: '500mb' }), async (req, res) => {
  try {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'No se recibió el ZIP.' });
    const zipPath = path.join(UPDATES_DIR, `upload-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, buf);
    const staging = path.join(os.tmpdir(), `ae-update-${Date.now()}`);
    fs.mkdirSync(staging, { recursive: true });
    try {
      await run('unzip', ['-q', '-o', zipPath, '-d', staging], { timeout: 180000 });
    } catch (e) {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ error: 'No se pudo descomprimir el ZIP: ' + e.message });
    }
    res.json({ data: { ok: true, message: 'Actualización iniciada.' } });
    startUpdate('zip', staging);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al iniciar la actualización' });
  }
});

// ---- Pull desde Git interno (LAN) ----
updatesRouter.post('/git-pull', async (req, res) => {
  try {
    const gitUrl = (req.body?.git_url || '').toString().trim();
    if (!gitUrl) return res.status(400).json({ error: 'Falta git_url' });
    const staging = path.join(os.tmpdir(), `ae-update-${Date.now()}`);
    fs.mkdirSync(staging, { recursive: true });
    try {
      await run('git', ['clone', '--depth', '1', gitUrl, staging], { timeout: 300000 });
    } catch (e) {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ error: 'No se pudo clonar el repo: ' + e.message });
    }
    res.json({ data: { ok: true, message: 'Pull iniciado.' } });
    startUpdate('git', staging);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al iniciar el pull' });
  }
});

// ---- Revertir al último backup ----
updatesRouter.post('/revert', async (req, res) => {
  try {
    const prev = readState();
    let backupFile = (req.body?.backupFile || prev?.backupFile || '').toString();
    // Si viene sólo el nombre del archivo (desde el listado del panel), resolver
    // la ruta completa contra el directorio de backups.
    if (backupFile && !backupFile.includes('/') && !backupFile.includes('\\')) {
      backupFile = path.join(BACKUPS_DIR, backupFile);
    }
    if (!backupFile || !fs.existsSync(backupFile)) {
      return res.status(404).json({ error: 'No hay backup registrado para revertir.' });
    }
    const st = { status: 'running', step: 'revert', kind: 'revert', startedAt: new Date().toISOString(), log: [], version: currentVersion() };
    writeState(st);
    res.json({ data: { ok: true, message: 'Reversión iniciada.' } });
    (async () => {
      try {
        log(st, 'Restaurando código desde backup…');
        await run('tar', ['xzf', backupFile, '-C', APP_ROOT], { timeout: 300000 });
        log(st, 'Código restaurado. Reconstruyendo…');
        await buildAndRestart(st);
      } catch (e) {
        st.status = 'failed'; st.error = e.message; st.finishedAt = new Date().toISOString();
        log(st, 'Reversión fallida: ' + e.message, 'error');
        writeState(st);
      }
    })().catch(() => {});
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al revertir' });
  }
});

// ---- Listar backups disponibles ----
updatesRouter.get('/backups', (req, res) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.tar.gz')).map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
    }).sort((a, b) => b.mtime.localeCompare(a.mtime));
    res.json({ data: { backups: files, registered: readState()?.backupFile || null } });
  } catch {
    res.json({ data: { backups: [], registered: null } });
  }
});