import * as XLSX from 'xlsx';

export function exportToExcel(headers, rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}