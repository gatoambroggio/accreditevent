/**
 * Export an array of rows to a CSV file that Excel opens natively.
 * No external dependencies — uses BOM + semicolon separator for Excel/es-AR compatibility.
 */
export function exportToExcel(headers, rows, filename) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes('"') || s.includes(';') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(';'))
    .join('\r\n');

  const bom = '\uFEFF'; // UTF-8 BOM so Excel reads accents correctly
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}