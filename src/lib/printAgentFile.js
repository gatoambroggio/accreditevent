// Descarga del script del agente local de impresión.
// El contenido se importa como texto crudo (?raw) desde print-agent/agent.js
// para mantener una sola fuente de verdad.

import agentScript from '../../print-agent/agent.js?raw';

export function downloadAgentScript() {
  const blob = new Blob([agentScript], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'accreditevent-print-agent.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}