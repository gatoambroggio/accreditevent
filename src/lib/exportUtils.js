export function exportToExcel(headers, rows, filename) {
  const escapeCell = (cell) =>
    String(cell ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const headerRow = `<tr style="background:#047857;color:#fff;font-weight:700;">${headers
    .map((h) => `<th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">${escapeCell(h)}</th>`)
    .join('')}</tr>`;

  const dataRows = rows
    .map(
      (row, i) =>
        `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f0fdf4'};">${row
          .map(
            (cell) =>
              `<td style="border:1px solid #cbd5e1;padding:5px 10px;text-align:left;mso-number-format:'\\@';">${escapeCell(
                cell
              )}</td>`
          )
          .join('')}</tr>`
    )
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${filename}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px;">${headerRow}${dataRows}</table></body>
</html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}