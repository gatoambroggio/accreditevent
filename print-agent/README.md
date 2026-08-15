# AccreditEvent Print Agent

Agente local para impresión automática de credenciales sin diálogo del navegador.

## Instalación

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