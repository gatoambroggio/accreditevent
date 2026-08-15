// Integración con el AccreditEvent Print Agent (localhost:9100).
// Si el agente no está disponible, cae al diálogo del navegador (window.print()).

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const AGENT_URL = 'http://localhost:9100';
const TIMEOUT_MS = 1500;

function fetchWithTimeout(url, options = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Verifica si el agente local está corriendo
export async function checkAgent() {
  try {
    const res = await fetchWithTimeout(`${AGENT_URL}/health`, {}, TIMEOUT_MS);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}

// Lista las impresoras disponibles en el sistema operativo del agente
export async function getAgentPrinters() {
  try {
    const res = await fetchWithTimeout(`${AGENT_URL}/printers`, {}, 3000);
    if (res.ok) {
      const data = await res.json();
      return data.printers || [];
    }
    return [];
  } catch {
    return [];
  }
}

// Genera un PDF (base64) desde un elemento DOM del badge
async function elementToPdfBase64(element) {
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  // Convertir dimensiones del elemento a mm (1px ≈ 0.2646mm a 96 DPI)
  const wPx = element.offsetWidth || 800;
  const hPx = element.offsetHeight || 600;
  const wMm = wPx * 0.264583;
  const hMm = hPx * 0.264583;

  const pdf = new jsPDF({
    orientation: wMm > hMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [wMm, hMm],
    compress: true,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(imgData, 'JPEG', 0, 0, wMm, hMm);
  return pdf.output('datauristring').split(',')[1];
}

// Envía un elemento DOM como PDF a la impresora del agente.
// Devuelve true si se envió, false si el agente no está disponible o falló.
export async function printToAgent(element, printerName, copies = 1) {
  if (!printerName) return false;
  try {
    const base64 = await elementToPdfBase64(element);
    const res = await fetchWithTimeout(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer: printerName, pdf_base64: base64, copies }),
    }, 10000);
    return res.ok;
  } catch {
    return false;
  }
}

// Imprime varios elementos secuencialmente al agente.
// onProgress(currentIndex, total) se llama después de cada intento.
// Devuelve { sent, total, usedFallback }.
export async function printBatchToAgent(elements, printerName, onProgress) {
  if (!printerName) {
    if (onProgress) onProgress(elements.length, elements.length);
    return { sent: 0, total: elements.length, usedFallback: true };
  }
  let sent = 0;
  for (let i = 0; i < elements.length; i++) {
    if (onProgress) onProgress(i, elements.length);
    try {
      const base64 = await elementToPdfBase64(elements[i]);
      const res = await fetchWithTimeout(`${AGENT_URL}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printer: printerName, pdf_base64: base64, copies: 1 }),
      }, 10000);
      if (res.ok) sent++;
    } catch {}
    if (i < elements.length - 1) await new Promise((r) => setTimeout(r, 500));
  }
  if (onProgress) onProgress(elements.length, elements.length);
  return { sent, total: elements.length, usedFallback: false };
}