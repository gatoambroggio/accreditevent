import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Loader2 } from 'lucide-react';
import { printToAgent } from '@/lib/printAgent';
import { printBadge as printBadgeFallback } from '@/lib/printBadge';
import { base44 } from '@/api/base44Client';

export default function BadgePrint({ accreditation, event, printerName, onClose }) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    const badge = document.querySelector('.badge-print');
    let sent = false;
    if (badge) {
      sent = await printToAgent(badge, printerName, 1);
    }
    if (!sent) {
      printBadgeFallback();
    }
    if (accreditation?.id) {
      base44.entities.Accreditation.update(accreditation.id, { delivered_personal: true }).catch(() => {});
    }
    setTimeout(() => setPrinting(false), 1000);
  };

  return (
    <div className="badge-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="badge-wrapper my-8 w-full max-w-sm">
        <div className="no-print mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Credencial</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {printing ? 'Imprimiendo…' : 'Imprimir'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Badge — 8cm × 10cm */}
        <div
          className="badge-print mx-auto bg-white shadow-2xl"
          style={{
            width: '8cm',
            height: '10cm',
            padding: '0.6cm',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {event?.logo_url ? (
              <img
                src={event.logo_url}
                alt="Logo"
                style={{ maxHeight: '2cm', maxWidth: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  height: '2cm',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.5rem',
                  backgroundColor: '#0f766e',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '1.5rem',
                }}
              >
                {event?.name?.charAt(0)?.toUpperCase() || 'A'}
              </div>
            )}
          </div>

          {/* Event name */}
          <p style={{ marginTop: '0.3rem', fontSize: '0.7rem', fontWeight: 600, color: '#475569', textAlign: 'center' }}>
            {event?.name}
          </p>
          {event?.venue && (
            <p style={{ fontSize: '0.55rem', color: '#94a3b8', textAlign: 'center' }}>{event.venue}</p>
          )}

          <hr style={{ margin: '0.4rem 0', border: 0, borderTop: '1px solid #e2e8f0' }} />

          {/* Person data */}
          <div style={{ textAlign: 'center', marginTop: '0.3rem' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {accreditation?.person_name}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
              {accreditation?.person_type}
            </p>
          </div>

          {/* Access area */}
          <div
            style={{
              marginTop: 'auto',
              backgroundColor: '#0f766e',
              borderRadius: '0.5rem',
              padding: '0.5rem',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#a7f3d0',
                fontFamily: 'monospace',
                margin: 0,
              }}
            >
              Área de acceso
            </p>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'white', marginTop: '0.1rem', margin: 0 }}>
              {accreditation?.access_level || accreditation?.area || 'General'}
            </p>
          </div>

          {/* QR + Badge code */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
            <div style={{ flexShrink: 0 }}>
              <QRCodeSVG
                value={accreditation?.id || ''}
                size={72}
                level="M"
              />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.55rem', color: '#94a3b8', fontFamily: 'monospace', margin: 0 }}>
                Código
              </p>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', fontFamily: 'monospace', margin: 0 }}>
                {accreditation?.badge_code}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}