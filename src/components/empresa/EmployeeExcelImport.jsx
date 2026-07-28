import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function EmployeeExcelImport({ open, onClose, onImport, companyName }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  if (!open) return null;

  const downloadTemplate = () => {
    const headers = ['Nombre', 'Apellido', 'Documento', 'Telefono', 'Tipo (Fijo/Eventual)', 'Área de acceso', 'Fases (Armado/Show/Desarme)'];
    const example = ['Juan', 'Pérez', '12345678', '11 12345678', 'Fijo', 'general', 'Armado, Show'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.writeFile(wb, 'plantilla_empleados.xls', { bookType: 'biff8' });
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = data.map((row) => {
        const nombre = String(row['Nombre'] || row['nombre'] || '').trim();
        const apellido = String(row['Apellido'] || row['apellido'] || '').trim();
        const tipoRaw = String(row['Tipo'] || row['Tipo (Fijo/Eventual)'] || row['tipo'] || '').toLowerCase().trim();
        const fasesRaw = String(row['Fases'] || row['Fases (Armado/Dia/Desarme)'] || row['fases'] || '').toLowerCase();
        const event_phases = [];
        if (fasesRaw.includes('arm')) event_phases.push('armado');
        if (fasesRaw.includes('dia') || fasesRaw.includes('show')) event_phases.push('dia_evento');
        if (fasesRaw.includes('desa')) event_phases.push('desarme');
        return {
          full_name: `${nombre} ${apellido}`.trim(),
          document: String(row['Documento'] || row['documento'] || row['DNI'] || row['dni'] || '').replace(/\D/g, ''),
          phone: String(row['Telefono'] || row['Teléfono'] || row['telefono'] || '').trim(),
          employment_type: tipoRaw.startsWith('eve') ? 'eventual' : 'fijo',
          access_area: String(row['Área de acceso'] || row['Área'] || row['area'] || 'general').trim().toLowerCase(),
          event_phases,
          company: companyName,
          person_type: String(row['Área de acceso'] || row['Área'] || row['area'] || 'general').trim().toLowerCase(),
          status: 'active',
        };
      }).filter((r) => r.full_name);
      setRows(mapped);
      if (mapped.length === 0) {
        setError('No se encontraron filas válidas. Descargá la plantilla para ver el formato esperado.');
      }
    } catch (err) {
      setError('No se pudo leer el archivo. Asegurate de que sea un Excel válido.');
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      await onImport(rows);
      setResult({ success: rows.length, total: rows.length });
      setRows([]);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err.message || 'Error al importar.');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Importación masiva</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Cargar empleados desde Excel</h2>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          {result ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="mt-3 text-lg font-bold text-slate-900">{result.success} empleados importados</p>
              <p className="mt-1 text-sm text-slate-500">Los empleados ya están disponibles para acreditación.</p>
              <button onClick={handleClose} className="mt-5 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Cerrar</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                  <Download className="h-4 w-4" /> Descargar plantilla
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
                  <Upload className="h-4 w-4" /> Seleccionar Excel
                  <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" onChange={handleFile} className="hidden" />
                </label>
                {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}
              {rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">{rows.length} empleados a importar</p>
                    <button onClick={handleImport} disabled={importing} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {importing ? 'Importando…' : 'Confirmar importación'}
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b border-slate-100">
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Nombre</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">DNI</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Teléfono</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Tipo</th>
                          <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Fases</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="px-3 py-2 text-sm text-slate-700">{r.full_name}</td>
                            <td className="px-3 py-2 text-sm text-slate-500">{r.document || '—'}</td>
                            <td className="px-3 py-2 text-sm text-slate-500">{r.phone || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.employment_type === 'fijo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {r.employment_type === 'fijo' ? 'Fijo' : 'Eventual'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {r.event_phases?.length ? r.event_phases.map((p) => ({armado:'Armado',dia_evento:'Show',desarme:'Desarme'})[p]).join(', ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}