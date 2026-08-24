# OCR de DNI con PaddleOCR (offline, sin GPU)

PaddleOCR lee **exactamente** lo impreso en el DNI (no alucina como los modelos
de visión). Corre en **CPU** en 1-3s. Es el camino principal de `readDni`.
El servidor es air-gapped, así que PaddleOCR se instala desde un **bundle de
wheels** que se arma una sola vez en una PC con internet y se copia por pendrive.

## 1) Armar el bundle (en una PC con internet, Ubuntu amd64)

Usá una PC con el **mismo sistema** que el servidor (Ubuntu x86_64, Python 3.10+).
Si la PC es Windows/Mac, instalá PaddleOCR en el servidor por otros medios o usá
una VM Ubuntu para que los wheels `manylinux` resuelvan bien las dependencias.

```bash
mkdir -p paddle-packages
pip3 download \
  paddlepaddle==2.6.2 \
  paddleocr==2.7.3 \
  numpy==1.26.4 \
  -d paddle-packages
```

> ⚠️ **`numpy==1.26.4` es obligatorio.** `paddlepaddle 2.6.2` se compiló contra
> numpy 1.x (ABI `0x1000009`). Si el bundle trae numpy 2.x, PaddleOCR no importa y
> el error es: `module compiled against ABI version 0x1000009 but this version of
> numpy is 0x2000000`. Con `numpy==1.26.4` forzada en la descarga, el bundle
> traerá el wheel 1.x correcto.

Esto baja `paddlepaddle`, `paddleocr`, `numpy 1.26.4` y **todas** sus dependencias
(pillow, shapely, pyclipper, lmdb, etc.) como wheels `.whl` en la carpeta
`paddle-packages` (~250-350 MB en total).

> Si pip no encuentra alguna dependencia binaria, agregá:
> `--platform manylinux2014_x86_64 --python-version 3.10 --only-binary=:all:`
> (ajustá `3.10` a la versión de Python del servidor: `python3 --version`).

## 2) Copiar el bundle al servidor

```bash
# desde la PC con internet → pendrive → servidor
# en el servidor, el bundle tiene que quedar en:
#   <repo>/server/bin/paddle-packages/
```

Es decir, copiá la carpeta `paddle-packages/` a `server/bin/paddle-packages/`
dentro del repo del servidor (ej. `/opt/accreditevent-repo/server/bin/paddle-packages/`).

## 3) Instalar + precalentar modelos

```bash
sudo bash server/install.sh
```

`install.sh` detecta el bundle y corre:

```
pip3 install --no-index --find-links server/bin/paddle-packages \
  paddlepaddle==2.6.2 paddleocr==2.7.3
```

Después hace un **warmup**: la primera vez PaddleOCR baja sus modelos de
detección + reconocimiento en español (~100 MB). Esto **necesita internet** en
esa corrida. Si el servidor no tiene internet ni siquiera para eso:

1. En la PC con internet, instalá PaddleOCR y corré una vez:
   ```bash
   pip3 install paddlepaddle==2.6.2 paddleocr==2.7.3
   python3 -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='es').ocr('cualquier_imagen.png', cls=True)" || true
   ```
   (los modelos quedan en `~/.paddleocr/`).
2. Copiá `~/.paddleocr/` al home del usuario del servicio en el servidor
   (`/opt/accreditevent/.paddleocr/`).
3. Volvé a correr `sudo bash server/install.sh` — el warmup los encontrará locales.

## 4) Verificar

En el servidor, como el usuario del servicio:

```bash
python3 server/src/functions/_paddleOcr.py --check
# → OK
```

Si devuelve `OK`, el escaneo de DNI del panel usa PaddleOCR automáticamente.
Si devuelve `NO`, `readDni` cae a Tesseract (mientras tanto) sin colgarse.

## Notas

- **Sin GPU**: PaddleOCR no usa GPU (`use_gpu=False` en `_paddleOcr.py`). Anda en
  CPU 1-3s por DNI. No necesita Ollama ni placa de video.
- **Ollama desactivado sin GPU**: `install.sh` omite el bloque de Ollama/moondream
  cuando no detecta GPU NVIDIA, así que el sistema nunca intenta llamar a un
  modelo de visión lento que cuelgue el escaneo.
- **Foto / biometría**: la foto del rostro se extrae en el **navegador** con
  face-api.js (modelos servidos desde `/models/`). No depende del servidor ni de
  GPU; funciona igual con o sin PaddleOCR.
- El resultado del OCR es **editable** en el modal de escaneo: si un campo quedó
  mal, el operador lo corrige antes de guardar la persona.