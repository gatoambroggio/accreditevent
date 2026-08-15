// Integración con el AccreditEvent Print Agent.
// El agente escucha en 127.0.0.1 en uno de varios puertos posibles (9100,
// 9101, 9200, 9300, 4100) para esquivar puertos reservados en Windows.
// Usamos 127.0.0.1 (no localhost) para evitar que macOS resuelva a IPv6 (::1)
// mientras el agente escucha solo en IPv4. Si el agente no está disponible,
// cae al diálogo del navegador (window.print()).

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const AGENT_HOST = '127.0.0.1';
const AGENT_PORTS = [9100, 9101, 9200, 9300, 4100];
let _agentPort = null;

function fetchWithTimeout(url, options = {}, ms = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Descubre en qué puerto escucha el agente probando /health en cada candidato.
function discoverPort() {
  if (_agentPort) return Promise.resolve(_agentPort);
  return (async () => {
    for (const port of AGENT_PORTS) {
      try {
        const res = await fetchWithTimeout(`http://${AGENT_HOST}:${port}/health`, {}, 1500);
        if (res.ok) { _agentPort = port; return port; }
      } catch {}
    }
    return null;
  })();
}

async function agentUrl(path) {
  const port = await discoverPort();
  return port ? `http://${AGENT_HOST}:${port}${path}` : null;
}

// Verifica si el agente local está corriendo (y cachea el puerto).
export async function checkAgent() {
  const port = await discoverPort();
  if (!port) return null;
  try {
    const res = await fetchWithTimeout(`http://${AGENT_HOST}:${port}/health`, {}, 1500);
    if (!res.ok) { _agentPort = null; return null; }
    return await res.json();
  } catch {
    _agentPort = null;
    return null;
  }
}

// Lista las impresoras disponibles en el sistema operativo del agente.
export async function getAgentPrinters() {
  const url = await agentUrl('/printers');
  if (!url) return [];
  try {
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) { _agentPort = null; return []; }
    const data = await res.json();
    return data.printers || [];
  } catch {
    _agentPort = null;
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
    if (!res.ok) { _agentPort = null; return false; }
    return true;
  } catch {
    _agentPort = null;
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