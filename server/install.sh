#!/usr/bin/env bash
# =============================================================================
# AccreditEvent Self-Hosted — Instalador one-click para Ubuntu Server (air-gapped)
# =============================================================================
# Prepara todo el stack en una sola corrida:
#   - Node 20+, PostgreSQL 16, Nginx, libs de Tesseract
#   - Base de datos + migración Prisma + seed (superadmin)
#   - Build del frontend React + servido por Nginx
#   - Modelos de face-api.js locales (sin internet)
#   - .env con secretos aleatorios
#   - Servicio systemd + Nginx reverse proxy (/api + /ws)
#
# Uso:  sudo bash install.sh
# Re-ejecutable: detecta lo ya instalado y continúa desde donde falta.
# =============================================================================
set -euo pipefail

# ── Configuración (editable) ─────────────────────────────────────────────────
APP_USER="${APP_USER:-accreditevent}"
APP_HOME="${APP_HOME:-/opt/accreditevent}"
DB_NAME="${DB_NAME:-accreditevent}"
DB_USER="${DB_USER:-accreditevent}"
DB_PASS="${DB_PASS:-accreditevent}"
SERVER_PORT="${SERVER_PORT:-4000}"
DOMAIN="${DOMAIN:-_}"   # IP o dominio; "_" = cualquiera
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$REPO_DIR}"   # raíz con package.json del frontend

# ── Helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}▶ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}" >&2; }
step() { echo -e "\n${GREEN}═══ $1 ═══${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
has()  { command -v "$1" >/dev/null 2>&1; }
rand() { openssl rand -hex 24; }

# ── Prechecks ─────────────────────────────────────────────────────────────────
step "Prechecks"
if [[ $EUID -ne 0 ]]; then err "Ejecutá con sudo: sudo bash install.sh"; exit 1; fi
if ! has lsb_release; then apt-get update -qq && apt-get install -qq -y lsb-release >/dev/null; fi
DISTRO="$(lsb_release -is 2>/dev/null || echo Ubuntu)"
if [[ "$DISTRO" != "Ubuntu" ]]; then warn "Distro detectado: $DISTRO (script pensado para Ubuntu; continuando igual)"; fi
ok "Ejecutando como root en $DISTRO"

# ── 0. Auto-actualización desde Git ──────────────────────────────────────────
# Si este install.sh se corre desde el directorio de despliegue
# (/opt/accreditevent/server) en vez de desde el repo, busca el repo git real,
# hace `git pull` y re-ejecuta la versión nueva del install.sh. Así basta con
# correr "sudo bash /opt/accreditevent/server/install.sh" y el servidor se
# actualiza solo desde GitHub — sin copiar nada a mano.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SELF_PARENT="$(cd "$SELF_DIR/.." && pwd)"
_find_git_repo() {
  for c in "$_SELF_PARENT" "$SELF_DIR/.." "$HOME/accreditevent" "$HOME/accreditevent-repo" "/opt/accreditevent-repo" "/srv/accreditevent" "$PWD"; do
    [[ -z "$c" ]] && continue
    if [[ -d "$c/.git" && -f "$c/server/install.sh" ]]; then echo "$c"; return; fi
  done
}
_REPO_GIT="$(_find_git_repo || true)"
if [[ -n "$_REPO_GIT" && "$_REPO_GIT" != "$_SELF_PARENT" ]]; then
  step "Auto-actualización desde Git"
  _owner="$(stat -c '%U' "$_REPO_GIT" 2>/dev/null || echo root)"
  log "Repo git encontrado en $_REPO_GIT — git pull..."
  if sudo -u "$_owner" git -C "$_REPO_GIT" pull --ff-only >/dev/null 2>&1; then
    ok "Código actualizado desde Git"
  else
    warn "git pull falló (sin internet o conflictos) — usando el código ya presente en $_REPO_GIT"
  fi
  log "Re-ejecutando install.sh del repo actualizado..."
  exec bash "$_REPO_GIT/server/install.sh"
fi
# Si ya estamos corriendo desde el repo git, hacer pull in-place.
if [[ -d "$_SELF_PARENT/.git" ]]; then
  _owner="$(stat -c '%U' "$_SELF_PARENT" 2>/dev/null || echo root)"
  if sudo -u "$_owner" git -C "$_SELF_PARENT" pull --ff-only >/dev/null 2>&1; then
    ok "Código actualizado desde Git (in-place)"
  else
    warn "git pull falló o sin internet — usando el código ya presente"
  fi
elif [[ "$_SELF_PARENT" == "$APP_HOME" ]]; then
  warn "No se encontró repo git junto al install.sh — el código NO se actualizará solo."
  echo "    Cloná el repo junto a este install.sh (ej: /opt/accreditevent-repo con .git y server/)"
  echo "    o ejecutá el install.sh desde el repo. Así la próxima vez se auto-actualiza."
fi

# ── 1. Dependencias del sistema ──────────────────────────────────────────────
step "Dependencias del sistema (Node, Postgres, Nginx, Tesseract)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Herramientas base necesarias en imágenes mínimas (rsync para copiar código, git
# para bajar modelos face-api, wget como fallback de descarga).
apt-get install -qq -y rsync git wget curl ca-certificates >/dev/null 2>&1 || warn "Algunas herramientas base (rsync/git/wget) no se instalaron"

# Node 20+ vía NodeSource
if ! has node || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  log "Instalando Node 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1 || true
  apt-get install -qq -y nodejs >/dev/null
fi
ok "Node $(node -v)"

# PostgreSQL 16
if ! has psql; then
  log "Instalando PostgreSQL 16..."
  apt-get install -qq -y curl ca-certificates gnupg >/dev/null
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null 2>&1 || true
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list 2>/dev/null || true
  apt-get update -qq
  apt-get install -qq -y postgresql-16 >/dev/null 2>&1 || apt-get install -qq -y postgresql >/dev/null
  systemctl enable --now postgresql >/dev/null 2>&1 || true
fi
ok "PostgreSQL $(psql --version 2>/dev/null | awk '{print $3}')"

# Nginx
if ! has nginx; then apt-get install -qq -y nginx >/dev/null; systemctl enable --now nginx >/dev/null 2>&1 || true; fi
ok "Nginx $(nginx -v 2>&1 | cut -d/ -f2)"

# Tesseract del sistema (binario nativo, no tesseract.js que necesita WASM de
# internet) + poppler-utils para rasterizar PDFs (pólizas/ART subidas en PDF).
apt-get install -qq -y unzip imagemagick zbar-tools tesseract-ocr tesseract-ocr-spa poppler-utils graphicsmagick build-essential python3 >/dev/null 2>&1 || warn "Algunas libs opcionales no se instalaron"
OCR_STATUS="no instalado"
if has tesseract; then
  _tver="$(tesseract --version 2>/dev/null | head -1 | awk '{print $2}')"
  if tesseract --list-langs 2>/dev/null | grep -qw spa; then
    OCR_STATUS="Tesseract $_tver (idioma: spa)"
    ok "Tesseract $_tver + idioma español"
  elif tesseract --list-langs 2>/dev/null | grep -qw eng; then
    OCR_STATUS="Tesseract $_tver (idioma: eng — falta spa)"
    warn "Falta el idioma español de Tesseract (tesseract-ocr-spa). El OCR caerá a inglés (menor calidad en DNI, ok en patentes). Instalalo: sudo apt-get install -y tesseract-ocr-spa"
  else
    OCR_STATUS="Tesseract $_tver (sin idiomas)"
    warn "Tesseract no tiene idiomas instalados. Instalá: sudo apt-get install -y tesseract-ocr-spa"
  fi
else
  warn "Tesseract NO se instaló — el OCR de DNI/patentes no funcionará. Instalalo: sudo apt-get install -y tesseract-ocr tesseract-ocr-spa"
fi

# ── 2. Usuario de servicio + directorios ─────────────────────────────────────
step "Usuario y directorios"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -r -m -d "$APP_HOME" -s /bin/bash "$APP_USER"
fi
install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME/server" "$APP_HOME/frontend/dist" "$APP_HOME/uploads" "$APP_HOME/server/public/models"
ok "Usuario $APP_USER + $APP_HOME"

# ── 3. Base de datos ──────────────────────────────────────────────────────────
step "PostgreSQL: base de datos y usuario"
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" >/dev/null
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH SUPERUSER;" >/dev/null 2>&1 || true
  ok "Base $DB_NAME + usuario $DB_USER creados"
else
  ok "Base $DB_NAME ya existe"
fi

# ── 4. Copiar código del servidor ────────────────────────────────────────────
step "Servidor: código + dependencias"
rsync -a --delete --exclude node_modules --exclude uploads --exclude public --exclude .env "$REPO_DIR/server/" "$APP_HOME/server/"
chown -R "$APP_USER":"$APP_USER" "$APP_HOME/server"

# .env con secretos aleatorios
if [[ ! -f "$APP_HOME/server/.env" ]]; then
  JWT_SECRET=$(rand); REFRESH_SECRET=$(rand)
  cat > "$APP_HOME/server/.env" <<EOF
NODE_ENV=production
PORT=$SERVER_PORT
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME?schema=public
JWT_SECRET=$JWT_SECRET
REFRESH_TOKEN_SECRET=$REFRESH_SECRET
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=30d
OTP_TTL_MINUTES=10
LAN_BASE_URL=http://127.0.0.1:$SERVER_PORT
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=15
TESSERACT_LANG=spa
# OCR por LLM de visión (opcional). Si lo configurás, el lector de DNI y
# patentes usa un modelo multimodal (igual que Base44 cloud) en vez de
# Tesseract — calidad muy superior sobre fotos de cámara. Sin esto, cae
# automáticamente a Tesseract local. Funciona con cualquier endpoint
# OpenAI-compatible (OpenAI, Azure OpenAI, Groq, Ollama, etc.).
# VISION_API_KEY=sk-...
# VISION_BASE_URL=https://api.openai.com/v1/chat/completions
# VISION_MODEL=gpt-4o-mini
EOF
  chmod 600 "$APP_HOME/server/.env"
  chown "$APP_USER":"$APP_USER" "$APP_HOME/server/.env"
  ok ".env generado con secretos aleatorios"
else
  ok ".env ya existe (conservado)"
fi

log "npm install (servidor)..."
# Sin --omit=dev: prisma (CLI) está en devDependencies y lo necesitamos instalado
# para que `npx prisma generate/db push` no descargue nada de internet en re-ejecuciones air-gapped.
sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && npm install --no-fund --no-audit" >/dev/null 2>&1 || { err "npm install del servidor falló"; exit 1; }

log "Prisma: generate + db push (crea las tablas desde schema.prisma)..."
sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && npx prisma generate && npx prisma db push" >/dev/null 2>&1 || { err "Prisma db push falló — ver schema.prisma y DATABASE_URL"; exit 1; }

log "Seed (superadmin admin@accreditevent.local / admin123)..."
if ! sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && SEED_EMAIL=admin@accreditevent.local SEED_PASSWORD=admin123 npm run seed" >/dev/null 2>&1; then
  warn "Seed falló — mostrando salida:"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && SEED_EMAIL=admin@accreditevent.local SEED_PASSWORD=admin123 npm run seed" 2>&1 | tail -n 30
fi
ok "Servidor instalado + DB migrada + seed"

# ── 4b. Importación de datos desde la nube (opcional) ─────────────────────────
step "Importación de datos (opcional)"
IMPORT_ZIP="$APP_HOME/server/import-data.zip"
if [[ -f "$IMPORT_ZIP" ]]; then
  log "Detectado import-data.zip — importando datos de la nube..."
  # Necesita adm-zip (instalado en el paso 4 como dependencia).
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && npm run import:from-zip -- '$IMPORT_ZIP'" 2>&1 | tee /tmp/ae-import.log || warn "La importación tuvo errores — ver /tmp/ae-import.log"
  ok "Importación finalizada"
else
  ok "Sin import-data.zip — base vacía (normal en install fresco). Copiá el ZIP exportado desde el panel de la nube para migrar tu data."
fi

# ── 4c. Binarios del agente de impresión portable ─────────────────────────────
step "Agente de impresión portable (Windows .exe + macOS)"
PA_DIST=""
for c in "$REPO_DIR/print-agent/dist" "$REPO_DIR/../print-agent/dist" "$APP_HOME/server/print-agent/dist" "$HOME/accreditevent/print-agent/dist" "/opt/accreditevent-repo/print-agent/dist"; do
  if [[ -d "$c" ]] && ls "$c/"*.exe "$c/"accreditevent-print-agent-mac-* >/dev/null 2>&1; then PA_DIST="$c"; break; fi
done
if [[ -n "$PA_DIST" ]]; then
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_HOME/server/print-agent/dist"
  rsync -a "$PA_DIST/" "$APP_HOME/server/print-agent/dist/"
  chown -R "$APP_USER":"$APP_USER" "$APP_HOME/server/print-agent"
  ok "Binarios del agente copiados a $APP_HOME/server/print-agent/dist (desde $PA_DIST)"
  echo "    Se sirven desde el panel en Configuración → Impresión (descarga directa, sin Node)."
else
  warn "Sin print-agent/dist/ — los binarios portable no se construyeron en este checkout."
  echo "    Opciones para construirlos (necesitás internet una sola vez):"
  echo "      1) En una PC con internet:  cd print-agent && npm install && npm run build"
  echo "         y volvé a correr este install.sh para copiarlos al servidor."
  echo "      2) Descargá los binarios ya compilados desde GitHub Releases y ponelos en print-agent/dist/"
  echo "    El agente .js (requiere Node) siempre está disponible como fallback."
fi

# ── 5. Frontend React ─────────────────────────────────────────────────────────
step "Frontend React: build self-hosted (air-gapped)"
FRONTEND_PERSIST="$APP_HOME/frontend-src"

# Descubrir el código fuente del frontend. Puede estar en el repo clonado
# (junto a server/) o ya persistido en $FRONTEND_PERSIST de una corrida
# anterior. Sin este código no se puede compilar el panel, así que lo
# buscamos en varios lugares para que el instalador funcione solo.
FE_SRC=""
for c in "$FRONTEND_DIR" "$REPO_DIR" "$REPO_DIR/.." "$PWD" "$FRONTEND_PERSIST" "$HOME/accreditevent" "$HOME/accreditevent-repo" "/opt/accreditevent-repo" "/srv/accreditevent"; do
  [[ -z "$c" ]] && continue
  if [[ -f "$c/package.json" && -f "$c/src/App.jsx" ]]; then FE_SRC="$c"; break; fi
done
# Buscar hacia arriba desde el repo (por si install.sh está anidado)
if [[ -z "$FE_SRC" ]]; then
  _p="$REPO_DIR"
  for _ in 1 2 3 4 5 6; do
    if [[ -f "$_p/package.json" && -f "$_p/src/App.jsx" ]]; then FE_SRC="$_p"; break; fi
    _p="$(dirname "$_p")"; [[ "$_p" == "/" ]] && break
  done
fi

if [[ -n "$FE_SRC" ]]; then
  ok "Frontend fuente encontrado en $FE_SRC"
  # Persistir el código en el server para que re-runs (incluso desde
  # /opt/accreditevent/server) puedan reconstruir sin needing el repo original.
  if [[ "$FE_SRC" != "$FRONTEND_PERSIST" ]]; then
    log "Copiando fuente del frontend a $FRONTEND_PERSIST (persistente para re-runs)..."
    rsync -a --delete --exclude node_modules --exclude dist "$FE_SRC/" "$FRONTEND_PERSIST/"
  fi
  chown -R "$APP_USER":"$APP_USER" "$FRONTEND_PERSIST" 2>/dev/null || true

  # Parchear la copia persistente para que el build no hable con la nube de Base44.
  log "Parcheando frontend para build air-gapped (base44Client + vite.config)..."
  cat > "$FRONTEND_PERSIST/src/api/base44Client.js" <<'EOF'
// [self-hosted] Apunta el SDK al servidor local Express (/api) en vez de a la nube de Base44.
// Re-exporta el wrapper localClient que respeta la misma superficie del SDK.
export { base44 } from '@/api/localClient';
export { base44 as default } from '@/api/localClient';
EOF

  cat > "$FRONTEND_PERSIST/vite.config.js" <<'EOF'
// [self-hosted] Vite config sin @base44/vite-plugin (que requiere manifiest cloud en build-time).
// Solo React + alias @ -> src. @base44/sdk y @base44/vite-plugin quedan en package.json
// pero no se importan, así no rompen el build ni el builder cloud del repo original.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 }
})
EOF
  # Parchear MODEL_URL en faceRecognition.js para que el navegador cargue los
  # modelos desde /models/ (servido local por Nginx) en vez del CDN remoto — sin
  # esto la biometría facial no anda en LAN air-gapped. Solo toca la copia
  # persistente self-hosted; la versión cloud del repo queda intacta (CDN).
  if [[ -f "$FRONTEND_PERSIST/src/lib/faceRecognition.js" ]]; then
    sed -i "s#const MODEL_URL = .*#const MODEL_URL = '/models/';#" "$FRONTEND_PERSIST/src/lib/faceRecognition.js"
    ok "faceRecognition.js parcheado (MODEL_URL='/models/')"
  fi

  ok "Parches self-hosted aplicados (idempotente)"

  log "npm install (frontend)..."
  sudo -u "$APP_USER" -H bash -lc "cd '$FRONTEND_PERSIST' && npm install --no-fund --no-audit" || warn "npm install del frontend tuvo warnings"

  log "Vite build (VITE_API_URL=/api)..."
  if ! sudo -u "$APP_USER" -H bash -lc "cd '$FRONTEND_PERSIST' && VITE_API_URL=/api BROWSERSLIST_IGNORE_OLD_DATA=1 npm run build"; then
    err "Build del frontend falló — log arriba ↑"
    exit 1
  fi
  rsync -a --delete "$FRONTEND_PERSIST/dist/" "$APP_HOME/frontend/dist/"
  # Nginx corre como www-data: necesita atravesar toda la cadena de directorios
  # hasta dist/ y leer index.html. Le damos x (atravesar) a los padres y rX a dist.
  chmod a+x "$APP_HOME" "$APP_HOME/frontend" 2>/dev/null || true
  chmod -R a+rX "$APP_HOME/frontend/dist" 2>/dev/null || true
  ok "Frontend compilado en $APP_HOME/frontend/dist"
else
  err "No se encontró el código fuente del frontend en ningún lado."
  echo "    El instalador necesita el frontend (carpeta con package.json + src/App.jsx)."
  echo "    Desde una PC con el repo, copialo al servidor (una sola vez):"
  echo "      scp -r ./accreditevent gato@ubuntudahua:/opt/accreditevent-repo"
  echo "    Y luego ejecutá:  sudo bash /opt/accreditevent-repo/server/install.sh"
  echo "    (En re-runs posteriores el código ya queda persistido en $FRONTEND_PERSIST y no hace falta el repo.)"
fi

# ── 6. Modelos face-api.js (offline) ──────────────────────────────────────────
step "Modelos face-api.js (servidos locales, sin internet)"
MODELS_DIR="$APP_HOME/server/public/models"
MODELS=(ssd_mobilenetv1_model.bin ssd_mobilenetv1_model-weights_manifest.json face_landmark_68_model.bin face_landmark_68_model-weights_manifest.json face_recognition_model.bin face_recognition_model-weights_manifest.json)
install -d -o "$APP_USER" -g "$APP_USER" "$MODELS_DIR"

need_models() {
  for f in "${MODELS[@]}"; do [[ -s "$MODELS_DIR/$f" ]] || return 0; done
  return 1
}

# Estrategia 0: copiar desde el repo si vienen bundled (air-gapped, sin internet)
if need_models; then
  for bundled in "$REPO_DIR/server/public/models" "$REPO_DIR/.." "$REPO_DIR/print-agent/weights" "$FRONTEND_PERSIST/public/models"; do
    [[ -d "$bundled" ]] || continue
    for f in "${MODELS[@]}"; do
      [[ -s "$MODELS_DIR/$f" ]] && continue
      [[ -s "$bundled/$f" ]] && cp "$bundled/$f" "$MODELS_DIR/$f"
    done
  done
  chown -R "$APP_USER":"$APP_USER" "$MODELS_DIR" 2>/dev/null || true
fi

if need_models; then
  log "Bajando modelos de face-api.js desde CDN (jsdelivr → raw.githubusercontent)..."
  # vladmandic/face-api guarda los pesos en /model (no /weights) como *.bin +
  # *-weights_manifest.json. jsdelivr sirve el repo por HTTPS de forma confiable;
  # raw.githubusercontent es el fallback. Los nombres viejos (-1.bin en /weights)
  # no existen en ningún fork y por eso la descarga fallaba silenciosamente.
  for BASE in \
    "https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model" \
    "https://raw.githubusercontent.com/vladmandic/face-api/master/model"; do
    need_models || break
    for f in "${MODELS[@]}"; do
      [[ -s "$MODELS_DIR/$f" ]] && continue
      wget -q -O "$MODELS_DIR/$f" "$BASE/$f" 2>/dev/null || rm -f "$MODELS_DIR/$f"
    done
  done
  chown -R "$APP_USER":"$APP_USER" "$MODELS_DIR" 2>/dev/null || true
fi

if need_models; then
  log "Sin internet a GitHub y sin modelos bundled: biometría facial queda en espera."
  log "Se habilitará automáticamente en la próxima instalación con conectividad (no requiere acción manual)."
  log "El resto del sistema funciona normalmente."
else
  ok "Modelos de face-api.js presentes (${#MODELS[@]} archivos)"
fi

# ── 6b. NVIDIA GPU + driver (para Ollama con CUDA) ───────────────────────────
# Ollama trae su propio runtime CUDA bundled, pero necesita el driver de NVIDIA
# cargado en el kernel. Si hay GPU, le instalamos el driver y Ollama la usa solo
# (calidad de nube, 2-6s por DNI). Si no hay GPU todavía, avisamos — Ollama igual
# instala y el OCR cae a Tesseract; cuando pongas la NVIDIA y re-corras install.sh
# la visión se activa sola.
step "NVIDIA GPU (driver para visión con CUDA)"
if has nvidia-smi && nvidia-smi >/dev/null 2>&1; then
  _gpu="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
  ok "GPU NVIDIA detectada: ${_gpu:-ok}. Ollama la usará con CUDA automáticamente."
elif has lspci && lspci 2>/dev/null | grep -qiE 'nvidia|vga compatible|3d controller'; then
  log "Placa NVIDIA detectada en lspci pero sin driver. Instalando nvidia-driver-535..."
  apt-get install -qq -y nvidia-driver-535 >/dev/null 2>&1 || warn "No se pudo instalar nvidia-driver-535. Instalalo a mano y reiniciá el servidor."
  warn "Reiniciá el servidor para que cargue el driver NVIDIA, luego volvé a correr: sudo bash server/install.sh"
else
  warn "No se detectó GPU NVIDIA. Ollama instalará igual pero correrá en CPU (~60s/DNI) — el OCR caerá a Tesseract. Para visión fluida, instalá una NVIDIA y re-ejecutá install.sh."
fi

# ── 6c. Modelo de visión local (Ollama + minicpm-v) ──────────────────────────
# OCR por visión con calidad tipo nube, 100% local en el propio servidor
# (air-gapped). Ollama expone un endpoint OpenAI-compatible en 127.0.0.1:11434
# que readDni / readPatente ya saben usar (SystemSetting.vision_ocr). Si no se
# puede instalar (sin internet y sin binario/modelo local), el OCR sigue con
# Tesseract — no rompe nada.
step "Modelo de visión local (Ollama + moondream) — OCR de DNI/patentes"
# Sin GPU NVIDIA, Ollama/moondream se OMITE: en CPU tarda ~60s/DNI y alucina datos.
# El OCR del DNI/patentes queda en PaddleOCR (preciso, CPU) + Tesseract (respaldo).
VISION_STATUS="omitido (sin GPU — PaddleOCR/Tesseract)"
if has nvidia-smi && nvidia-smi >/dev/null 2>&1; then
# moondream (1.8b) corre en CPU en ~15-25s y lee el DNI mucho mejor que Tesseract.
# Si más adelante ponés GPU NVIDIA, el modelo sigue funcionando (y mucho más rápido).
VISION_MODEL_NAME="${VISION_MODEL_NAME:-moondream}"
OLLAMA_OK=0
VISION_STATUS="no instalado (OCR usa Tesseract)"

if ! has ollama; then
  # Estrategia 1: binario local bundled (air-gapped, sin internet)
  for bundled in "$REPO_DIR/server/bin/ollama" "$APP_HOME/server/bin/ollama" "/usr/local/bin/ollama"; do
    [[ -x "$bundled" ]] || continue
    install -m 0755 "$bundled" /usr/local/bin/ollama
    ok "Ollama instalado desde binario local: $bundled"
    break
  done
  # Estrategia 2: instalador oficial (requiere internet una sola vez)
  if ! has ollama; then
    log "Instalando Ollama desde ollama.com (requiere internet)..."
    if curl -fsSL https://ollama.com/install.sh | sh >/dev/null 2>&1; then
      ok "Ollama instalado desde ollama.com"
    else
      warn "No se pudo instalar Ollama (sin internet o binario local). El OCR seguirá con Tesseract."
      echo "    Para habilitar visión local: descargá el binario de Ollama en una PC con internet,"
      echo "    copialo a server/bin/ollama y volvé a correr: sudo bash server/install.sh"
    fi
  fi
else
  ok "Ollama ya instalado ($(ollama --version 2>/dev/null || echo ok))"
fi

if has ollama; then
  # Asegurar servicio systemd escuchando SOLO en 127.0.0.1:11434 (no exponer a la LAN).
  # El instalador oficial crea /etc/systemd/system/ollama.service; si no existe, lo creamos.
  if [[ ! -f /etc/systemd/system/ollama.service ]]; then
    cat > /etc/systemd/system/ollama.service <<'EOF'
[Unit]
Description=Ollama Service (local vision OCR for AccreditEvent)
After=network.target

[Service]
Type=simple
User=root
Environment="OLLAMA_HOST=127.0.0.1:11434"
ExecStart=/usr/local/bin/ollama serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
  fi
  systemctl enable ollama >/dev/null 2>&1 || true
  systemctl restart ollama >/dev/null 2>&1 || true
  sleep 3

  if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    ok "Ollama responde en 127.0.0.1:11434"

    # Determinar el usuario bajo el que corre el servicio para que `ollama pull`
    # guarde los modelos en el mismo store que lee `ollama serve` (si no, el
    # servidor no ve el modelo bajado). El oficial usa 'ollama'; nuestro unit usa root.
    OLLAMA_USER="root"
    if systemctl cat ollama 2>/dev/null | grep -qE '^User=ollama'; then OLLAMA_USER="ollama"; fi

    if ! sudo -u "$OLLAMA_USER" ollama list 2>/dev/null | grep -qw "$VISION_MODEL_NAME"; then
      log "Cargando modelo de visión $VISION_MODEL_NAME (la 1ra vez baja ~1.9GB y puede tardar varios minutos)..."
      # Estrategia 1: pull desde Ollama (internet)
      if sudo -u "$OLLAMA_USER" ollama pull "$VISION_MODEL_NAME" >/dev/null 2>&1; then
        ok "Modelo $VISION_MODEL_NAME descargado desde Ollama"
      else
        # Estrategia 2: cargar desde .gguf local (air-gapped)
        GGUF_FOUND=""
        for gguf in "$REPO_DIR/server/models/$VISION_MODEL_NAME.gguf" "$APP_HOME/server/models/$VISION_MODEL_NAME.gguf" "$REPO_DIR/models/$VISION_MODEL_NAME.gguf"; do
          [[ -s "$gguf" ]] && { GGUF_FOUND="$gguf"; break; }
        done
        if [[ -n "$GGUF_FOUND" ]]; then
          log "Cargando $VISION_MODEL_NAME desde .gguf local: $GGUF_FOUND (air-gapped)..."
          TMP_MOD=$(mktemp -d)
          printf 'FROM %s\n' "$GGUF_FOUND" > "$TMP_MOD/Modelfile"
          if sudo -u "$OLLAMA_USER" ollama create "$VISION_MODEL_NAME" -f "$TMP_MOD/Modelfile" >/dev/null 2>&1; then
            ok "Modelo $VISION_MODEL_NAME cargado desde .gguf local"
          else
            warn "ollama create falló desde el .gguf — ver formato del archivo. Visión queda en espera."
          fi
          rm -rf "$TMP_MOD"
        else
          warn "No se pudo bajar $VISION_MODEL_NAME (sin internet ni .gguf local). Visión queda en espera; OCR sigue con Tesseract."
          echo "    Descargá el .gguf de moondream en una PC con internet, copialo a"
          echo "    server/models/$VISION_MODEL_NAME.gguf y volvé a correr: sudo bash server/install.sh"
        fi
      fi
    else
      ok "Modelo $VISION_MODEL_NAME ya cargado"
    fi

    # Si el modelo quedó cargado, configurar SystemSetting.vision_ocr automáticamente
    if sudo -u "$OLLAMA_USER" ollama list 2>/dev/null | grep -qw "$VISION_MODEL_NAME"; then
      log "Configurando OCR del sistema para usar visión local ($VISION_MODEL_NAME)..."
      if sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && VISION_MODEL_NAME='$VISION_MODEL_NAME' node src/configure-vision.js" >/dev/null 2>&1; then
        ok "SystemSetting.vision_ocr apuntado a Ollama local (modelo $VISION_MODEL_NAME)"
        OLLAMA_OK=1
        VISION_STATUS="Ollama + $VISION_MODEL_NAME activo (visión local)"
      else
        warn "No se pudo guardar la config de visión en la DB. El admin puede setearla a mano en Configuración → OCR:"
        echo "    api_key=ollama  base_url=http://127.0.0.1:11434/v1/chat/completions  model=$VISION_MODEL_NAME"
      fi
    fi
  else
    warn "Ollama instalado pero no responde en 127.0.0.1:11434 — ver: journalctl -u ollama -n 30"
  fi
fi
fi   # fin del guard GPU — sin GPU se omite Ollama y el OCR usa PaddleOCR/Tesseract

# ── 6d. PaddleOCR (OCR dedicado, preciso en CPU) ──────────────────────────────
# A diferencia de los VLM (moondream) que ALUCINAN datos que no están impresos,
# PaddleOCR es un motor de OCR real: lee EXACTAMENTE lo que está en el DNI.
# Es el camino principal de readDni. Corre en CPU en 1-3s por imagen (sin GPU).
step "PaddleOCR (OCR dedicado para DNI en CPU)"
PADDLE_OK=0
if ! has python3; then
  warn "python3 no disponible — PaddleOCR salteado. OCR sigue con VLM/Tesseract."
else
  # Libs de sistema que OpenCV (dep de PaddleOCR) necesita en un server sin
  # escritorio: sin libgl1 el import de cv2 truena con "libGL.so.1 not found".
  apt-get install -qq -y python3-pip libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 >/dev/null 2>&1 || warn "Algunas libs de sistema no se instalaron — PaddleOCR podría fallar al importar cv2."
  # Estrategia 1: bundle local de wheels (air-gapped, sin internet)
  PADDLE_BUNDLE=""
  for b in "$REPO_DIR/server/bin/paddle-packages" "$APP_HOME/server/bin/paddle-packages"; do
    [[ -d "$b" ]] && { PADDLE_BUNDLE="$b"; break; }
  done
  if [[ -n "$PADDLE_BUNDLE" ]]; then
    log "Instalando PaddleOCR desde bundle local: $PADDLE_BUNDLE"
    # numpy<2 es OBLIGATORIO: paddlepaddle 2.6.2 se compiló contra numpy 1.x
    # (ABI 0x1000009); con numpy 2.x (ABI 0x2000000) truena al importar con
    # "module compiled against ABI version 0x1000009 but this version of numpy
    # is 0x2000000". Sin esto PaddleOCR no carga y readDni cae a Tesseract (basura).
    if pip3 install --no-index --find-links="$PADDLE_BUNDLE" "paddlepaddle==2.6.2" "paddleocr==2.7.3" "numpy==1.26.4" >/dev/null 2>&1; then
      ok "PaddleOCR instalado desde bundle local"; PADDLE_OK=1
    else
      warn "Falló el bundle local — ver que tenga paddlepaddle + paddleocr + deps."
    fi
  fi
  # Estrategia 2: pip desde PyPI (requiere internet una sola vez)
  if [[ $PADDLE_OK -eq 0 ]]; then
    log "Instalando PaddleOCR desde PyPI (requiere internet)..."
    # numpy<2 (ver nota en el camino del bundle) — paddlepaddle 2.6.2 no soporta numpy 2.x.
    if pip3 install "paddlepaddle==2.6.2" "paddleocr==2.7.3" "numpy==1.26.4" >/dev/null 2>&1; then
      ok "PaddleOCR instalado desde PyPI"; PADDLE_OK=1
    else
      warn "No se pudo instalar PaddleOCR (sin internet ni bundle). OCR sigue con VLM/Tesseract."
      echo "    Air-gapped: en una PC con internet corré"
      echo "    'pip3 download paddlepaddle==2.6.2 paddleocr==2.7.3 -d server/bin/paddle-packages'"
      echo "    copiá esa carpeta al servidor y volvé a correr: sudo bash server/install.sh"
    fi
  fi
  # Warmup como APP_USER contra la copia INSTALADA en APP_HOME (no el repo
  # fuente, que accreditevent no puede leer → "Permission denied"). La 1ra vez
  # PaddleOCR baja los modelos de detección + reconocimiento (~100MB) bajo el
  # usuario del servicio, para que air-gapped los encuentre en su home. No
  # silenciamos stderr: si falla, el error real queda visible en el log.
  PADDLE_PY="$APP_HOME/server/src/functions/_paddleOcr.py"
  if [[ $PADDLE_OK -eq 1 ]]; then
    log "Precargando modelos de PaddleOCR (descarga única ~100MB la 1ra vez)..."
    if sudo -u "$APP_USER" -H bash -lc "python3 '$PADDLE_PY' --warmup"; then
      ok "PaddleOCR funcional (modelos cargados para $APP_USER)"
    else
      warn "PaddleOCR instalado pero el warmup falló — ver error arriba ↑"
      echo "    Si es por modelos: copiá ~/.paddleocr de un equipo con internet a ~$APP_USER/.paddleocr."
    fi
  fi
fi

# ── 7. systemd ────────────────────────────────────────────────────────────────
step "Servicio systemd"
cat > /etc/systemd/system/accreditevent.service <<EOF
[Unit]
Description=AccreditEvent self-hosted server
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_HOME/server
EnvironmentFile=$APP_HOME/server/.env
ExecStart=$(which node) src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable accreditevent >/dev/null 2>&1
systemctl restart accreditevent
sleep 2
if systemctl is-active --quiet accreditevent; then ok "Servicio accreditevent activo"; else err "El servicio no arrancó — ver: journalctl -u accreditevent -n 50"; fi

# ── 8. Certificado SSL (self-signed, 10 años) ─────────────────────────────────
# La cámara (getUserMedia) solo funciona en origins seguros (HTTPS o localhost).
# Generamos un certificado self-signed en una carpeta propia del app para no
# depender de /etc/ssl/private (que puede no existir en imágenes mínimas).
step "Certificado SSL self-signed"
SSL_DIR="$APP_HOME/ssl"
install -d -o root -g root "$SSL_DIR"
SSL_CRT="$SSL_DIR/ae-self.crt"
SSL_KEY="$SSL_DIR/ae-self.key"
if [[ ! -s "$SSL_CRT" || ! -s "$SSL_KEY" ]]; then
  log "Generando certificado self-signed (10 años)..."
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_KEY" \
    -out "$SSL_CRT" \
    -subj "/CN=accreditevent-local" >/dev/null 2>&1 || { err "openssl falló al generar el certificado"; exit 1; }
  chmod 600 "$SSL_KEY"
  chmod 644 "$SSL_CRT"
  ok "Certificado generado en $SSL_DIR"
else
  ok "Certificado ya existe (conservado)"
fi

# ── 9. Nginx ──────────────────────────────────────────────────────────────────
step "Nginx: sitio HTTPS + reverse proxy + redirección HTTP→HTTPS"
cat > /etc/nginx/sites-available/accreditevent <<EOF
# HTTP → HTTPS (redirección forzada para que getUserMedia/cámara funcione en LAN)
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

# HTTPS principal
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate     $SSL_CRT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;

    root $APP_HOME/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 500m;
    }

    location /ws {
        proxy_pass http://127.0.0.1:$SERVER_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location /uploads/ {
        alias $APP_HOME/server/uploads/;
    }

    location /models/ {
        alias $APP_HOME/server/public/models/;
    }
}
EOF
ln -sf /etc/nginx/sites-available/accreditevent /etc/nginx/sites-enabled/accreditevent
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t 2>/dev/null || { err "Config de Nginx inválida — ver arriba"; exit 1; }
systemctl reload nginx
ok "Nginx configurado (HTTPS + redirección) y recargado"

# ── 10. Verificación ──────────────────────────────────────────────────────────
step "Verificación"
sleep 2
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$SERVER_PORT/api/health" 2>/dev/null || echo "000")
if [[ "$API_CODE" == "200" ]]; then
  ok "API responde en :$SERVER_PORT/api/health (200)"
else
  err "API no responde (HTTP $API_CODE) — ver: journalctl -u accreditevent -n 80"
fi

# El frontend se sirve por HTTPS; usamos -k para aceptar el cert self-signed.
WEB_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1/" 2>/dev/null || echo "000")
if [[ "$WEB_CODE" == "200" ]]; then
  ok "Frontend sirve en https://127.0.0.1/ (200)"
else
  err "Frontend NO sirve (HTTPS $WEB_CODE). Diagnóstico:"
  echo "    -- dist/index.html:"
  ls -la "$APP_HOME/frontend/dist/index.html" 2>/dev/null || echo "      NO EXISTE — el build no se copió"
  echo "    -- permisos en la cadena de directorios:"
  namei -l "$APP_HOME/frontend/dist/index.html" 2>/dev/null || true
  echo "    -- ¿puede www-data leer index.html?"
  if sudo -u www-data test -r "$APP_HOME/frontend/dist/index.html" 2>/dev/null; then echo "      sí"; else echo "      NO (problema de permisos)"; fi
  echo "    -- certificado SSL:"
  ls -la "$SSL_CRT" "$SSL_KEY" 2>/dev/null || echo "      NO EXISTEN — el paso de SSL falló"
  echo "    -- últimos errores de Nginx:"
  tail -n 20 /var/log/nginx/error.log 2>/dev/null || true
fi

# Verificar que la redirección HTTP→HTTPS funciona
REDIR_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/" 2>/dev/null || echo "000")
if [[ "$REDIR_CODE" == "301" ]]; then
  ok "Redirección HTTP→HTTPS activa (301)"
else
  warn "La redirección HTTP→HTTPS no responde 301 (got $REDIR_CODE) — revisar config de Nginx"
fi

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ "$API_CODE" == "200" && "$WEB_CODE" == "200" ]]; then
  echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  AccreditEvent self-hosted instalado y corriendo${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  Panel:       ${GREEN}https://${LAN_IP:-127.0.0.1}/${NC}"
  echo -e "  Superadmin:  ${GREEN}admin@accreditevent.local${NC} / ${GREEN}admin123${NC}"
  echo -e "  OCR:         ${GREEN}${OCR_STATUS}${NC}"
  echo -e "  Visión:      ${GREEN}${VISION_STATUS}${NC}"
  echo -e "  Webhook Dahua:  ${GREEN}https://${LAN_IP:-127.0.0.1}/api/webhooks/dahua?key=API_KEY&sn=SERIAL${NC}"
  echo -e "  Webhook ZKTeco: ${GREEN}https://${LAN_IP:-127.0.0.1}/api/webhooks/zkteco?key=API_KEY&SN=SERIAL${NC}"
  echo -e "  Impresión:   Descargá el agente local en cada PC desde Configuración → Impresión"
  echo -e "               Ejecutá: node accreditevent-print-agent.js"
  echo -e "  Logs:        journalctl -u accreditevent -f"
  echo -e "  Reiniciar:   systemctl restart accreditevent"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
  echo -e "\n${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  err "Instalación INCOMPLETA (API=$API_CODE, Frontend=$WEB_CODE). Corregí lo de arriba y volvé a correr: sudo bash $APP_HOME/server/install.sh"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
fi