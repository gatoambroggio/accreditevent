// Preprocesamiento de imagen en el navegador para mejorar la precisión de
// Tesseract (que es el motor OCR local en air-gapped). Convierte a escala de
// grises, estira el contraste y escala la imagen a un tamaño apto para OCR
// (~1500-2000px). Sin esto, Tesseract falla sobre fotos de cámara (baja
// resolución, poco contraste, ruido) — que es justo el síntoma "no anda".
//
// Devuelve un Blob PNG listo para subir al servidor.

const OCR_MAX_DIM = 1800;

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = url;
  });
}

export async function enhanceImage(blob, { grayscale = true, contrast = 1.7, targetMax = OCR_MAX_DIM, binarize = false } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImg(url);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    // Escalar para que el lado mayor quede en targetMax (suficiente para OCR,
    // sin agrandar fotos enormes de teléfono que harían lento a Tesseract).
    const maxDim = Math.max(w, h);
    let scale = 1;
    if (maxDim < targetMax) scale = targetMax / maxDim;       // upscale chiquitas
    else if (maxDim > targetMax * 1.15) scale = targetMax / maxDim; // downscale gigantes
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    if (grayscale) {
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        // Luma + estiramiento de contraste alrededor de 128
        let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        v = (v - 128) * contrast + 128;
        v = Math.max(0, Math.min(255, v));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      // Binarización Otsu: umbral óptimo que separa tinta de fondo. Sobre el
      // DNI (texto chico sobre fondo con patrones de seguridad) mejora mucho
      // la lectura de Tesseract vs. solo grises+contraste. Opcional (solo DNI).
      if (binarize) {
        const hist = new Array(256).fill(0);
        const total = d.length / 4;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) { hist[d[i]]++; sum += d[i]; }
        let sumB = 0, wB = 0, varMax = 0, threshold = 127;
        for (let t = 0; t < 256; t++) {
          wB += hist[t];
          if (wB === 0) continue;
          const wF = total - wB;
          if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const between = wB * wF * (mB - mF) * (mB - mF);
          if (between > varMax) { varMax = between; threshold = t; }
        }
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] >= threshold ? 255 : 0;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
      }
      ctx.putImageData(id, 0, 0);
    }

    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  } finally {
    URL.revokeObjectURL(url);
  }
}