# AccreditEvent Print Agent

Agente local para impresión automática de credenciales sin diálogo del navegador.

## Binarios portable (sin Node.js) — recomendado

Las estaciones de trabajo **no necesitan instalar Node.js**: usá los ejecutables standalone
(Node embebido vía [@yao-pkg/pkg](https://github.com/yao-pkg/pkg)):

- **Windows:** `accreditevent-print-agent.exe` — doble clic para correr.
- **macOS Apple Silicon (M1/M2/M3):** `accreditevent-print-agent-mac-arm64`
- **macOS Intel:** `accreditevent-print-agent-mac-x64`

Los binarios se descargan **desde el panel** (Configuración → Impresión), servidos por el
backend en `/api/downloads/print-agent-win`, `/api/downloads/print-agent-mac-arm`,
`/api/downloads/print-agent-mac-x64`.

### Construir los binarios (una sola vez, en una PC con internet)

```bash
cd print-agent
npm install      # instala @yao-pkg/pkg
npm run build    # genera dist/accreditevent-print-agent.exe + los dos binarios macOS
```

Después copiá la carpeta `print-agent/dist/` al servidor y volvé a correr `install.sh`
(la copia a `$APP_HOME/server/print-agent/dist/` y el backend la sirve al panel).

> El servidor air-gapped **no construye** los binarios (no tiene internet). Se construyen
> en una PC con internet y se copian. El script `.js` (requiere Node) queda siempre como fallback.

### macOS: permisos del binario

```bash
chmod +x accreditevent-print-agent-mac-arm64
./accreditevent-print-agent-mac-arm64
```

La primera vez Gatekeeper lo bloquea: clic derecho sobre el archivo → **Abrir** → **Abrir** de todos modos.

### CI: auto-build en GitHub Actions

> El builder de la app no puede escribir en `.github/workflows/` (sin permiso). Creá este
> archivo a mano en el repo para que cada tag `print-agent-v*` compile y publique los binarios:

`.github/workflows/build-print-agent.yml`

```yaml
name: Build Print Agent
on:
  push:
    tags: ['print-agent-v*']
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: |
          cd print-agent
          npm install
          npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: print-agent-binaries
          path: |
            print-agent/dist/accreditevent-print-agent.exe
            print-agent/dist/accreditevent-print-agent-mac-x64
            print-agent/dist/accreditevent-print-agent-mac-arm64
      - if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: |
            print-agent/dist/accreditevent-print-agent.exe
            print-agent/dist/accreditevent-print-agent-mac-x64
            print-agent/dist/accreditevent-print-agent-mac-arm64
```

Para publicar una release: `git tag print-agent-v1.0.0 && git push --tags`.

---

## Alternativa: script .js (requiere Node)

### Requisitos previos

- **Node.js 18+** instalado en la PC ([descargar](https://nodejs.org))
- **Windows además:** SumatraPDF (versión portable) — [descargar](https://www.sumatrapdfreader.org/download-free-pdf-viewer)
  - Descargar la versión portable (`.zip`), extraer `SumatraPDF.exe` y copiarlo al mismo directorio que `agent.js` (o al `PATH`)

### 1. Descargar el agente

Desde **Configuración → Impresión de credenciales** en el panel, presioná el botón **Descargar agente**.
Guardá el archivo `accreditevent-print-agent.js` en una carpeta, por ejemplo `C:\accreditevent-agent\` (Windows) o `~/accreditevent-agent/` (Linux/Mac).

### 2. Ejecutar el agente

Abrí una terminal y ejecutá:

```bash
node accreditevent-print-agent.js
```

Verás:
```
AccreditEvent Print Agent escuchando en http://127.0.0.1:9100
```

Dejá la terminal abierta mientras usás el panel. El agente debe estar corriendo para que la impresión automática funcione.

### 3. Configurar las impresoras en el panel

En **Configuración → Impresión de credenciales**:
- **Impresora personal:** escribí el nombre exacto de la impresora A (credenciales personales)
- **Impresora vehicular:** escribí el nombre exacto de la impresora B (credenciales vehiculares)

Los nombres deben coincidir con los del sistema operativo. Si el agente está corriendo, podés ver la lista de impresoras disponibles con el botón **Ver impresoras disponibles**.

### 4. Imprimir

Cuando presiones **Imprimir** en una credencial, el panel envía el PDF al agente, que lo redirige a la impresora correspondiente **sin mostrar diálogo**. Si el agente no está corriendo, el panel cae automáticamente al diálogo del navegador.

---

## Inicio automático (opcional)

### Windows — inicio automático al boot

1. Abrí el Administrador de tareas → pestaña **Inicio**
2. O presioná `Win+R`, escribí `shell:startup` y presioná Enter
3. Creá un acceso directo a `node accreditevent-print-agent.js` en esa carpeta

### Linux — systemd (usuario)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/accreditevent-print-agent.service <<'EOF'
[Unit]
Description=AccreditEvent Print Agent
After=network.target

[Service]
ExecStart=/usr/bin/node %h/accreditevent-agent/accreditevent-print-agent.js
Restart=on-failure

[Install]
WantedBy=default.target
EOF

systemctl --user enable --now accreditevent-print-agent
```

### macOS — launchd

```bash
cat > ~/Library/LaunchAgents/com.accreditevent.print-agent.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.accreditevent.print-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/TU_USUARIO/accreditevent-agent/accreditevent-print-agent.js</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.accreditevent.print-agent.plist
```

---

## Endpoints del agente

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del agente |
| GET | `/printers` | Lista de impresoras del SO |
| POST | `/print` | Enviar PDF a imprimir (`{printer, pdf_base64, copies}`) |

El agente escucha en `127.0.0.1:9100` — solo accesible desde localhost.