import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';

function getToken() {
  try { return localStorage.getItem('ae_access_token'); } catch { return null; }
}

// Imprime un elemento DOM directamente a una impresora CUPS vía el backend local.
// El frontend genera el PDF con html2canvas+jsPDF (ya instalados) y lo envía
// al endpoint /api/print. Si el endpoint no existe (modo cloud) o falla,
// lanza error para que el llamador caiga a window.print().
export async function autoPrint(element, printerName, { width_mm = 80, height_mm = 100 } = {}) {
  if (!element) throw new Error('No hay elemento para imprimir');
  if (!printerName) throw new Error('No hay impresora configurada');

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const orientation = width_mm > height_mm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: [width_mm, height_mm] });
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, width_mm, height_mm);
  const pdfBase64 = pdf.output('datauristring');

  const token = getToken();
  const res = await fetch(`${API_BASE}/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ printer: printerName, pdf_base64: pdfBase64 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

// Imprime varios elementos a la misma impresora (uno por uno, secuencial).
export async function autoPrintBatch(elements, printerName, opts = {}) {
  const results = [];
  for (const el of elements) {
    try {
      await autoPrint(el, printerName, opts);
      results.push({ ok: true });
    } catch (e) {
      results.push({ ok: false, error: e.message });
    }
  }
  return results;
}

// Verifica si el endpoint de impresión local está disponible (modo self-hosted).
export async function isAutoPrintAvailable() {
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/print/printers`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Fallback: impresión vía diálogo del navegador (modo cloud o sin CUPS) ──

export function printBadges() {
  const container = document.querySelector('.badge-batch-print');
  if (!container) {
    window.print();
    return;
  }

  const portal = document.createElement('div');
  portal.id = 'print-portal';
  portal.appendChild(container.cloneNode(true));
  document.body.appendChild(portal);

  const style = document.createElement('style');
  style.id = 'print-badge-style';
  style.textContent = `
    @media print {
      @page { size: A5 landscape; margin: 0; }
      body > *:not(#print-portal) { display: none !important; }
      #print-portal { display: block !important; }
      #print-portal .badge-batch-print { display: block !important; padding: 0 !important; gap: 0 !important; margin: 0 !important; }
      #print-portal .badge-print { margin: 0 !important; box-shadow: none !important; position: static !important; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
      #print-portal .badge-print:last-child { page-break-after: auto; break-after: auto; }
    }
  `;
  document.head.appendChild(style);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (document.body.contains(portal)) document.body.removeChild(portal);
    if (document.head.contains(style)) document.head.removeChild(style);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
  setTimeout(cleanup, 2000);
}

export function printBadge() {
  const badge = document.querySelector('.badge-print');
  if (!badge) {
    window.print();
    return;
  }

  const portal = document.createElement('div');
  portal.id = 'print-portal';
  portal.appendChild(badge.cloneNode(true));
  document.body.appendChild(portal);

  const style = document.createElement('style');
  style.id = 'print-badge-style';
  style.textContent = `
    @media print {
      @page { size: A5 landscape; margin: 0; }
      body > *:not(#print-portal) { display: none !important; }
      #print-portal { display: block !important; }
      #print-portal .badge-print { margin: 0 !important; box-shadow: none !important; position: static !important; }
    }
  `;
  document.head.appendChild(style);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (document.body.contains(portal)) document.body.removeChild(portal);
    if (document.head.contains(style)) document.head.removeChild(style);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
  setTimeout(cleanup, 2000);
}