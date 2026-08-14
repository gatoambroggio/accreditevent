# 08 — Despliegue en Ubuntu Server

Guía paso a paso para un servidor Ubuntu 24.04 LTS en LAN air-gapped.

## 1. Preparar el servidor

```bash
# Usuario no-root con sudo
adduser accreditevent
usermod -aG sudo accreditevent
su - accreditevent

# Actualizar
sudo apt update && sudo apt upgrade -y

# Node 20 (desde paquete .deb transferido, sin internet)
# Bajar nodejs_20.x deb en otra máquina y copiarlo, o usar nvm offline
sudo dpkg -i nodejs_20.deb
node -v  # v20.x

# PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER accreditevent WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -c "CREATE DATABASE accreditevent OWNER accreditevent;"
```

## 2. Estructura de directorios

```
/opt/accreditevent/
├── api/              # backend Node/Express
│   ├── package.json
│   ├── prisma/schema.prisma
│   ├── src/...
│   ├── uploads/      # archivos (seguros, fotos) — Nginx los sirve
│   └── models/       # modelos face-api.js + tesseract lang data
├── web/              # build del frontend (dist/) — Nginx lo sirve
├── backups/          # pg_dump diarios
└── .env
```

## 3. Backend

```bash
cd /opt/accreditevent/api
npm install           # transferir node_modules prebuild si 100% offline
npx prisma migrate deploy
npx prisma generate

# .env
cat > .env <<EOF
DATABASE_URL=postgresql://accreditevent:CHANGE_ME@localhost:5432/accreditevent
JWT_SECRET=generar_con_openssl_rand_hex_32
UPLOAD_DIR=/opt/accreditevent/api/uploads
PORT=4000
OLLAMA_URL=http://localhost:11434   # opcional
EOF
```

## 4. PM2

```bash
sudo npm i -g pm2
pm2 start src/server.js --name accreditevent-api --env production
pm2 save
pm2 startup systemd    # follow the printed command
```

## 5. Frontend (build estático)

En una máquina con Node, build del React y copiar `dist/` a `/opt/accreditevent/web/`:
```bash
# en la PC de build
VITE_API_URL=https://accredit.local/api npm run build
scp -r dist/* server:/opt/accreditevent/web/
```

## 6. Nginx

```bash
sudo apt install -y nginx
```

```nginx
# /etc/nginx/sites-available/accreditevent
server {
  listen 80;
  server_name accredit.local;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name accredit.local;

  ssl_certificate     /etc/ssl/certs/accredit.crt;
  ssl_certificate_key /etc/ssl/private/accredit.key;

  client_max_body_size 20M;          # uploads de seguros/fotos

  # Frontend estático
  root /opt/accreditevent/web;
  index index.html;
  location / { try_files $uri /index.html; }

  # Modelos face-api.js y archivos subidos
  location /models/ { alias /opt/accreditevent/api/models/; }
  location /uploads/ {
    alias /opt/accreditevent/api/uploads/;
    add_header Content-Disposition "inline";
  }

  # API
  location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # ZKTeco webhook (sin /api, IP allowlist)
  location /iclock/ {
    # limit_except POST { deny all; }
    # allow 192.168.1.0/24; deny all;
    proxy_pass http://127.0.0.1:4000/zkteco/webhook;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/accreditevent /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 7. HTTPS autofirmado (air-gap)

```bash
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -key /etc/ssl/private/accredit.key \
  -out /etc/ssl/certs/accredit.crt \
  -subj "/CN=accredit.local"
# Distribuir el .crt a cada PDA e instalarlo como autoridad confiable en Chrome
```

## 8. DNS local
En el router/DNS de la LAN (o `/etc/hosts` de cada PDA): `192.168.1.10  accredit.local`

## 9. Backups (cron)

```bash
# /opt/accreditevent/api/backup.sh
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M)
pg_dump -U accreditevent accreditevent > /opt/accreditevent/backups/db-$DATE.sql
tar czf /opt/accreditevent/backups/uploads-$DATE.tgz /opt/accreditevent/api/uploads
# Mantener últimos 30 días
find /opt/accreditevent/backups -mtime +30 -delete
```
```bash
sudo crontab -e
# 0 2 * * * /opt/accreditevent/api/backup.sh
```

## 10. Restauración

```bash
psql -U accreditevent accreditevent < backup.sql
tar xzf uploads-DATE.tgz -C /opt/accreditevent/api/
```

## 11. Impresoras (credenciales)

El frontend genera el PDF con jsPDF y lo envía a la impresora local del navegador. Para impresoras térmicas/Zebra compartidas en la LAN, configurarlas con CUPS:

```bash
sudo apt install -y cups
sudo lpadmin -p zebra -E -v socket://192.168.1.20:9100 -m zebra.ppd
sudo cupsenable zebra
```
En el navegador de la estación de acreditación, seleccionar la impresora en el diálogo de impresión.

## 12. Modelos face-api.js y datos tesseract (offline)

Antes de cortar internet, descargar y copiar a `/opt/accreditevent/api/models/`:
- Modelos face-api.js (TinyFaceDetector, FaceLandmark68, FaceRecognition)
- `tesseract.js` traineddata: `spa.traineddata`, `eng.traineddata`
- (Opcional) modelo Ollama `qwen2.5:7b` vía `ollama pull` en una máquina con internet, luego copiar `~/.ollama/models` al servidor.

## 13. Hardening
- `ufw` solo 443 a la LAN, 22 por VPN/consola.
- PostgreSQL solo escucha en `127.0.0.1` (`listen_addresses = 'localhost'`).
- JWT_SECRET de 32+ bytes aleatorios.
- PM2 logs en `/var/log/pm2/`, rotación automática.