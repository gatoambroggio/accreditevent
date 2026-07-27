import * as XLSX from 'xlsx';

export function exportToExcel(headers, rows, filename) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, filename.slice(0, 31));
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' });
}