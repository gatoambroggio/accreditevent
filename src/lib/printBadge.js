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