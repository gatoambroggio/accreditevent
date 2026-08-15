// Integración con el AccreditEvent Print Agent.
// El agente escucha en 127.0.0.1 en uno de varios puertos posibles (9100,
// 9101, 9200, 9300, 4100) para esquivar puertos reservados en Windows.
// El frontend prueba 'localhost' primero (exento de mixed-content cuando la
// app se sirve por HTTPS) y '127.0.0.1' como fallback IPv4. Si el agente no
// está disponible, cae al diálogo del navegador (window.print()).

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const AGENT_HOSTS = ['localhost', '127.0.0.1'];
const AGENT_PORTS = [9100, 9101, 9200, 9300, 4100];
let _agentBase = null; // p.ej. 'http://localhost:9101'

function fetchWithTimeout(url, options = {}, ms = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Descubre la URL base del agente probando /health en cada combinación
// host×puerto. 'localhost' va primero (exento de mixed-content en HTTPS);
// '127.0.0.1' es fallback IPv4 por si localhost resuelve a ::1.
async function discoverBase() {
  if (_agentBase) return _agentBase;
  for (const host of AGENT_HOSTS) {
    for (const port of AGENT_PORTS) {
      try {
        const res = await fetchWithTimeout(`http://${host}:${port}/health`, {}, 1500);
        if (res.ok) { _agentBase = `http://${host}:${port}`; return _agentBase; }
      } catch {}
    }
  }
  return null;
}

async function agentUrl(path) {
  const base = await discoverBase();
  return base ? `${base}${path}` : null;
}

// Verifica si el agente local está corriendo (y cachea la URL base).
export async function checkAgent() {
  const base = await discoverBase();
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/health`, {}, 1500);
    if (!res.ok) { _agentBase = null; return null; }
    return await res.json();
  } catch {
    _agentBase = null;
    return null;
  }
}

// Lista las impresoras disponibles en el sistema operativo del agente.
export async function getAgentPrinters() {
  const url = await agentUrl('/printers');
  if (!url) return [];
  try {
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) { _agentBase = null; return []; }
    const data = await res.json();
    return data.printers || [];
  } catch {
    _agentBase = null;
    return [];
  }
}

// Genera un PDF (base64) desde un elemento DOM del badge.
async function elementToPdfBase64(element) {
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

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
export async function printToAgent(element, printerName, copies = 1) {
  if (!printerName) return false;
  const url = await agentUrl('/print');
  if (!url) return false;
  try {
    const base64 = await elementToPdfBase64(element);
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer: printerName, pdf_base64: base64, copies }),
    }, 10000);
    if (!res.ok) { _agentBase = null; return false; }
    return true;
  } catch {
    _agentBase = null;
    return false;
  }
}

// Imprime varios elementos secuencialmente al agente.
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
      const url = await agentUrl('/print');
      if (url) {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printer: printerName, pdf_base64: base64, copies: 1 }),
        }, 10000);
        if (res && res.ok) sent++;
      }
    } catch {}
    if (i < elements.length - 1) await new Promise((r) => setTimeout(r, 500));
  }
  if (onProgress) onProgress(elements.length, elements.length);
  return { sent, total: elements.length, usedFallback: false };
}