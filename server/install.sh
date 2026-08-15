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

# ── 1. Dependencias del sistema ──────────────────────────────────────────────
step "Dependencias del sistema (Node, Postgres, Nginx, Tesseract)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

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

# CUPS para impresión automática de credenciales (lp -d <impresora>)
if ! has lpstat; then
  log "Instalando CUPS..."
  apt-get install -qq -y cups cups-filters >/dev/null 2>&1 || warn "CUPS no se instaló (la impresión automática no funcionará)"
  systemctl enable --now cups >/dev/null 2>&1 || true
fi

# Configurar CUPS para acceso desde la LAN (admin configura impresoras desde su PC)
if has lpstat; then
  log "Configurando CUPS para acceso desde LAN..."
  CUPSD=/etc/cups/cupsd.conf
  sed -i 's/^#\?WebInterface .*/WebInterface Yes/' "$CUPSD" 2>/dev/null || true
  sed -i 's/^#\?Listen .*/Port 631/' "$CUPSD" 2>/dev/null || true
  if ! grep -q "AccreditEvent LAN access" "$CUPSD" 2>/dev/null; then
    cat >> "$CUPSD" <<'CUPSEOF'

# AccreditEvent LAN access
<Location />
  Allow @LOCAL
  Order allow,deny
</Location>
<Location /admin>
  Allow @LOCAL
  Order allow,deny
</Location>
CUPSEOF
  fi
  systemctl restart cups >/dev/null 2>&1 || true
fi
ok "CUPS $(lpstat -e 2>/dev/null | head -1 || echo 'sin impresoras configuradas')"

# Libs de sistema para Tesseract (tesseract.js las usa en runtime)
apt-get install -qq -y tesseract-ocr tesseract-ocr-spa graphicsmagick build-essential python3 >/dev/null 2>&1 || warn "Algunas libs opcionales no se instalaron (tesseract.js trae su propio worker)"
ok "Tesseract OCR + dependencias"

# ── 2. Usuario de servicio + directorios ─────────────────────────────────────
step "Usuario y directorios"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -r -m -d "$APP_HOME" -s /bin/bash "$APP_USER"
fi
# El usuario de servicio necesita permisos para mandar jobs a CUPS (lp).
usermod -aG lp "$APP_USER" 2>/dev/null || true
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
EOF
  chmod 600 "$APP_HOME/server/.env"
  chown "$APP_USER":"$APP_USER" "$APP_HOME/server/.env"
  ok ".env generado con secretos aleatorios"
else
  ok ".env ya existe (conservado)"
fi

log "npm install (servidor)..."
sudo -u "$APP_USER" -H bash -lc "cd '$APP_HOME/server' && npm install --omit=dev" >/dev/null 2>&1 || { err "npm install del servidor falló"; exit 1; }

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

# ── 5. Frontend React ─────────────────────────────────────────────────────────
step "Frontend React: build self-hosted (air-gapped)"
if [[ -f "$FRONTEND_DIR/package.json" ]]; then
  # 5a. Parchear la copia local para que el build no hable con la nube de Base44.
  #     Se sobrescriben sobre la copia clonada en disco (no se commitea al repo),
  #     así el repo de GitHub sigue siendo compatible con el builder cloud.
  log "Parcheando frontend para build air-gapped (base44Client + vite.config)..."
  cat > "$FRONTEND_DIR/src/api/base44Client.js" <<'EOF'
// [self-hosted] Apunta el SDK al servidor local Express (/api) en vez de a la nube de Base44.
// Re-exporta el wrapper localClient que respeta la misma superficie del SDK.
export { base44 } from '@/api/localClient';
export { base44 as default } from '@/api/localClient';
EOF

  cat > "$FRONTEND_DIR/vite.config.js" <<'EOF'
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
  build: { outDir: 'dist' }
})
EOF
  ok "Parches self-hosted aplicados (idempotente)"

  # El repo clonado quedó con owner root (sudo git clone): darle permiso de
  # escritura al usuario de servicio para que npm install / vite puedan crear
  # node_modules y dist.
  chown -R "$APP_USER":"$APP_USER" "$FRONTEND_DIR" 2>/dev/null || true

  log "npm install (frontend)..."
  sudo -u "$APP_USER" -H bash -lc "cd '$FRONTEND_DIR' && npm install" || warn "npm install del frontend tuvo warnings"

  log "Vite build (VITE_API_URL=/api)..."
  if ! sudo -u "$APP_USER" -H bash -lc "cd '$FRONTEND_DIR' && VITE_API_URL=/api npm run build"; then
    err "Build del frontend falló — log arriba ↑"
    exit 1
  fi
  rsync -a --delete "$FRONTEND_DIR/dist/" "$APP_HOME/frontend/dist/"
  # Nginx corre como www-data: necesita atravesar toda la cadena de directorios
  # hasta dist/ y leer index.html. Le damos x (atravesar) a los padres y rX a dist.
  chmod a+x "$APP_HOME" "$APP_HOME/frontend" 2>/dev/null || true
  chmod -R a+rX "$APP_HOME/frontend/dist" 2>/dev/null || true
  ok "Frontend compilado en $APP_HOME/frontend/dist"
else
  warn "No se encontró frontend en $FRONTEND_DIR (se salta el build — copialo manualmente)"
fi

# ── 6. Modelos face-api.js (offline) ──────────────────────────────────────────
step "Modelos face-api.js (servidos locales, sin internet)"
MODELS_DIR="$APP_HOME/server/public/models"
MODELS=(tiny_face_detector_model-1.bin face_landmark_68_model-1.bin face_recognition_model-1.bin ssd_mobilenetv1_model-1.bin)
install -d -o "$APP_USER" -g "$APP_USER" "$MODELS_DIR"

need_models() {
  for f in "${MODELS[@]}"; do [[ -s "$MODELS_DIR/$f" ]] || return 0; done
  return 1
}

if need_models; then
  log "Bajando modelos de face-api.js (git, mismo transporte que ya funcionó)..."
  TMP=$(mktemp -d)
  # Estrategia 1: sparse-checkout del repo de pesos (vladmandic fork incluye /weights)
  if git clone --depth 1 --filter=blob:none --sparse https://github.com/vladmandic/face-api.git "$TMP/faceapi" >/dev/null 2>&1; then
    (cd "$TMP/faceapi" && git sparse-checkout set weights) >/dev/null 2>&1
    for f in "${MODELS[@]}"; do [[ -s "$TMP/faceapi/weights/$f" ]] && cp "$TMP/faceapi/weights/$f" "$MODELS_DIR/$f"; done
  fi
  rm -rf "$TMP"

  # Estrategia 2 (fallback): wget a raw.githubusercontent si git falló
  if need_models; then
    log "Faltan algunos modelos — probando descarga directa (wget)..."
    for BASE in \
      "https://raw.githubusercontent.com/vladmandic/face-api/master/weights" \
      "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"; do
      need_models || break
      for f in "${MODELS[@]}"; do
        [[ -s "$MODELS_DIR/$f" ]] && continue
        wget -q -O "$MODELS_DIR/$f" "$BASE/$f" 2>/dev/null || rm -f "$MODELS_DIR/$f"
      done
    done
  fi

  chown -R "$APP_USER":"$APP_USER" "$MODELS_DIR" 2>/dev/null || true
fi

if need_models; then
  warn "No se pudieron descargar los modelos de face-api.js (sin internet a GitHub)."
  echo "    Copialos a mano a $MODELS_DIR desde cualquier PC con internet:"
  echo "      https://github.com/vladmandic/face-api/tree/master/weights"
  echo "    Archivos necesarios: ${MODELS[*]}"
  echo "    El reconocimiento facial no funcionará hasta que estén presentes."
  echo "    El resto del sistema funciona normalmente — solo biometría queda en espera."
else
  ok "Modelos de face-api.js presentes (${#MODELS[@]} archivos)"
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
        client_max_body_size 16m;
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
  echo -e "  Webhook Dahua:  ${GREEN}https://${LAN_IP:-127.0.0.1}/api/webhooks/dahua?key=API_KEY&sn=SERIAL${NC}"
  echo -e "  Webhook ZKTeco: ${GREEN}https://${LAN_IP:-127.0.0.1}/api/webhooks/zkteco?key=API_KEY&SN=SERIAL${NC}"
  echo -e "  Impresoras:  Configurá las impresoras en ${GREEN}https://${LAN_IP:-127.0.0.1}:631${NC} (CUPS)"
  echo -e "               Después asignalas en Configuración → Impresoras de credenciales"
  echo -e "  Logs:        journalctl -u accreditevent -f"
  echo -e "  Reiniciar:   systemctl restart accreditevent"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
  echo -e "\n${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  err "Instalación INCOMPLETA (API=$API_CODE, Frontend=$WEB_CODE). Corregí lo de arriba y volvé a correr: sudo bash $APP_HOME/server/install.sh"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
fi