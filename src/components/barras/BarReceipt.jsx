import React, { forwardRef, useImperativeHandle } from 'react';
import { printToAgent } from '@/lib/printAgent';

const fmtDate = (d) => {
  const dt = new Date(d || Date.now());
  return dt.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const PAY_LABELS = { cash: 'EFECTIVO', card: 'TARJETA', qr: 'QR MERCADO PAGO', demo: 'DEMO' };

// Imprime comanda (despachador) + comprobante (cliente) vía el Print Agent.
// Si no hay agente o impresora, cae a window.print() con layout térmico.
const BarReceipt = forwardRef(function BarReceipt({ sale, bar, event }, ref) {
  useImperativeHandle(ref, () => ({
    async printBoth(printerName) {
      const comanda = document.querySelector('.bar-print-comanda');
      const comprobante = document.querySelector('.bar-print-comprobante');
      if (!comanda || !comprobante) return;

      // Intentar agente de impresión local.
      if (printerName) {
        const ok1 = await printToAgent(comanda, printerName, 1).catch(() => false);
        if (ok1) await new Promise((r) => setTimeout(r, 800));
        const ok2 = await printToAgent(comprobante, printerName, 1).catch(() => false);
        if (ok1 && ok2) return;
      }

      // Fallback: diálogo del navegador con layout térmico.
      const html = `
        <html><head><meta charset="utf-8"><title>Comanda + Comprobante</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { font-family: 'Courier New', monospace; box-sizing: border-box; }
          .rcpt { width: 74mm; padding: 2mm; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .lg { font-size: 14px; }
          .md { font-size: 11px; }
          .sm { font-size: 9px; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          .dbl { border-top: 2px solid #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; font-size: 11px; }
          .gap { height: 8mm; }
        </style></head><body>
        ${comanda.outerHTML}
        <div class="gap"></div>
        ${comprobante.outerHTML}
        </body></html>`;
      const w = window.open('', '_blank', 'width=400,height=600');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
        w.close();
      }
    },
  }));

  if (!sale) return null;
  const dt = fmtDate(sale.created_at || sale.created_date || Date.now());
  const payLabel = PAY_LABELS[sale.payment_method] || 'EFECTIVO';
  const op = sale.operator_name || 'Operador';
  const saleId = (sale.id || '').slice(-6).toUpperCase();

  const itemRows = (sale.items || []).map((it) => {
    const name = String(it.name || '').slice(0, 24);
    const qty = `${it.qty}x`;
    const sub = `$${Number(it.subtotal || it.price * it.qty).toLocaleString('es-AR')}`;
    return { name, qty, sub };
  });

  return (
    <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
      {/* ===== COMANDA (despachador) ===== */}
      <div className="bar-print-comanda" style={{ width: '280px', padding: '8px', fontFamily: 'Courier New, monospace', color: '#000' }}>
        <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', letterSpacing: '2px' }}>*** COMANDA ***</div>
        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>{bar?.name || 'Barra'}</div>
        {event && <div style={{ textAlign: 'center', fontSize: '10px' }}>{event.name}</div>}
        <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '2px' }}>#{saleId}</div>
        <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
        <div style={{ fontSize: '11px' }}>{dt}</div>
        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
        {(sale.items || []).map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', marginBottom: '2px' }}>
            <span>{it.qty}x {String(it.name || '').slice(0, 22)}</span>
          </div>
        ))}
        <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '10px' }}>Op: {op}</div>
      </div>

      {/* ===== COMPROBANTE (cliente) ===== */}
      <div className="bar-print-comprobante" style={{ width: '280px', padding: '8px', fontFamily: 'Courier New, monospace', color: '#000' }}>
        <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>{bar?.name || 'Barra'}</div>
        {event && <div style={{ textAlign: 'center', fontSize: '10px' }}>{event.name}</div>}
        {bar?.location && <div style={{ textAlign: 'center', fontSize: '9px' }}>{bar.location}</div>}
        <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>COMPROBANTE</div>
        <div style={{ fontSize: '10px', marginTop: '2px' }}>{dt}</div>
        <div style={{ fontSize: '10px' }}>Op: {op} · #{saleId}</div>
        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
        {itemRows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '1px' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ marginLeft: '4px' }}>{r.qty}</span>
            <span style={{ marginLeft: '8px', minWidth: '50px', textAlign: 'right' }}>{r.sub}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
          <span>TOTAL</span>
          <span>${Number(sale.total || 0).toLocaleString('es-AR')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '4px' }}>
          <span>Pago:</span>
          <span style={{ fontWeight: 'bold' }}>{payLabel}</span>
        </div>
        <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
        <div style={{ textAlign: 'center', fontSize: '9px' }}>¡Gracias por su compra!</div>
      </div>
    </div>
  );
});

export default BarReceipt;