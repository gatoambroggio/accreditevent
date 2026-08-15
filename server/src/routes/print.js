// Ruta de impresión directa a impresoras CUPS del servidor local (air-gapped).
// El frontend genera el PDF de la credencial con html2canvas+jsPDF y lo envía
// aquí como base64. El backend lo manda a la cola CUPS correspondiente con `lp`.
import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export const printRouter = Router();

// POST /api/print — imprime un PDF en una impresora CUPS específica.
// Body: { printer: string, pdf_base64: string }
printRouter.post('/', async (req, res, next) => {
  try {
    const { printer, pdf_base64 } = req.body;
    if (!printer) return res.status(400).json({ error: 'Falta el nombre de la impresora (printer)' });
    if (!pdf_base64) return res.status(400).json({ error: 'Falta el PDF (pdf_base64)' });

    const file = path.join(os.tmpdir(), `ae-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`);
    const base64Data = pdf_base64.replace(/^data:application\/pdf;base64,/, '');
    await fs.writeFile(file, Buffer.from(base64Data, 'base64'));

    try {
      const { stdout } = await execFileAsync('lp', ['-d', printer, file]);
      res.json({ ok: true, printer, output: stdout?.trim() || null });
    } catch (lpErr) {
      res.status(502).json({
        error: `No se pudo imprimir en "${printer}". Verificá que CUPS esté corriendo (systemctl status cups) y que la impresora exista (lpstat -e). Detalle: ${lpErr.message}`,
      });
    }

    await fs.unlink(file).catch(() => {});
  } catch (e) {
    next(e);
  }
});

// GET /api/print/printers — lista las impresoras CUPS disponibles.
printRouter.get('/printers', async (_req, res) => {
  try {
    const { stdout } = await execFileAsync('lpstat', ['-e']);
    const printers = stdout.trim().split('\n').map((s) => s.trim()).filter(Boolean);
    res.json({ printers });
  } catch {
    res.json({ printers: [] });
  }
});