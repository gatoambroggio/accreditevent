// Helper para exportar a Excel real (.xlsx). Reutilizable por todos los
// reportes. XLSX.writeFile dispara la descarga en el navegador.
import * as XLSX from 'xlsx';

// sheets: [{ name: string, rows: object[] | any[][] }]
// Si rows[0] es un array, se usa aoa_to_sheet (array-of-arrays); si no,
// json_to_sheet (objetos con claves como encabezados).
export function downloadXlsx(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const rows = s.rows || [];
    const isAoa = Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]);
    const ws = isAoa ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, String(s.name).slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}