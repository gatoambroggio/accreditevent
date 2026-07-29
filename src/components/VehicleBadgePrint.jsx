import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Car } from 'lucide-react';
import { printBadge } from '@/lib/printBadge';

export default function VehicleBadgePrint({ vehicle, settings, events = [], parkingSectors = [], onClose }) {
  const handlePrint = () => {
    printBadge();
  };

  const orgName = settings?.organization_name || 'Acceso Eventos';
  const logoUrl = settings?.logo_url;

  const sectorLabel = parkingSectors.find((s) => s.value === vehicle?.parking_sector)?.label || vehicle?.parking_sector;

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return null;
    }
  };

  const eventNames = events.map((e) => e.name).filter(Boolean);
  const eventDates = events.map((e) => formatDate(e.start_at)).filter(Boolean);
  const dateText = eventDates.length > 1 ? `${eventDates[0]} - ${eventDates[eventDates.length - 1]}` : eventDates[0];

  return (
    <div className="badge-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="badge-wrapper my-8 w-full max-w-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Credencial de vehículo</h2>
          <div className="flex items-center gap-2">
            {settings?.printer_vehicular && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white">
                <Printer className="h-3.5 w-3.5" /> {settings.printer_vehicular}
              </span>
            )}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* A5 landscape — 21cm × 14.8cm */}
        <div
          className="badge-print mx-auto bg-white shadow-2xl"
          style={{
            width: '21cm',
            height: '14.8cm',
            padding: '0.9cm 1.1cm',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            fontFamily: 'Manrope, sans-serif',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ maxHeight: '1.4cm', maxWidth: '3.5cm', objectFit: 'contain' }} />
              ) : (
                <div style={{
                  height: '1.4cm', width: '1.4cm', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '0.4rem', backgroundColor: '#0f766e', color: 'white', fontWeight: 800, fontSize: '1.1rem',
                }}>
                  {orgName?.charAt(0)?.toUpperCase() || 'A'}
                </div>
              )}
              <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{orgName}</p>
                <p style={{ fontSize: '0.55rem', color: '#94a3b8', margin: 0, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Credencial de vehículo
                </p>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '1.8cm', height: '1.8cm', borderRadius: '50%',
              backgroundColor: '#ecfdf5', color: '#0f766e',
            }}>
              <Car style={{ width: '0.9cm', height: '0.9cm' }} />
            </div>
          </div>

          <hr style={{ margin: '0.5rem 0', border: 0, borderTop: '2px solid #0f766e' }} />

          {/* Main content */}
          <div style={{ display: 'flex', flex: 1, gap: '0.8rem', marginTop: '0.2rem', minHeight: 0 }}>
            {/* Left — vehicle data + event date */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <p style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontFamily: 'monospace', margin: 0 }}>
                Vehículo
              </p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0', lineHeight: 1.1 }}>
                {vehicle?.brand} {vehicle?.model}
              </p>
              {vehicle?.color && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Color: {vehicle.color}</p>
              )}
              <div style={{ marginTop: '0.3rem' }}>
                <span style={{
                  display: 'inline-block',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '0.3rem',
                  backgroundColor: vehicle?.status === 'approved' ? '#ecfdf5' : vehicle?.status === 'rejected' ? '#fef2f2' : '#fffbeb',
                  color: vehicle?.status === 'approved' ? '#059669' : vehicle?.status === 'rejected' ? '#dc2626' : '#d97706',
                  border: `1px solid ${vehicle?.status === 'approved' ? '#a7f3d0' : vehicle?.status === 'rejected' ? '#fecaca' : '#fde68a'}`,
                }}>
                  {vehicle?.status === 'approved' ? '✓ Autorizado' : vehicle?.status === 'rejected' ? '✗ Rechazado' : '⏳ Pendiente'}
                </span>
              </div>
              {eventNames.length > 0 && (
                <div style={{ marginTop: '0.3rem' }}>
                  <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontFamily: 'monospace', margin: 0 }}>
                    Evento
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f766e', margin: 0, lineHeight: 1.1, letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {eventNames.join(' · ')}
                  </p>
                  {dateText && (
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: '#475569', margin: '0.15rem 0 0 0', lineHeight: 1.1 }}>
                      {dateText}
                    </p>
                  )}
                </div>
              )}
              {vehicle?.notes && (
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.3rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vehicle.notes}</p>
              )}
            </div>

            {/* Right — plate + parking sector */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <div>
                <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontFamily: 'monospace', margin: '0 0 0.25rem 0', textAlign: 'center' }}>
                  Patente
                </p>
                <div style={{
                  border: '3px solid #0f172a',
                  borderRadius: '0.4rem',
                  padding: '0.35rem 0.7rem',
                  backgroundColor: '#fff',
                  minWidth: '5.5cm',
                  textAlign: 'center',
                }}>
                  <p style={{
                    fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace',
                    margin: 0, letterSpacing: '0.15em', lineHeight: 1,
                  }}>
                    {vehicle?.plate}
                  </p>
                </div>
              </div>
              {sectorLabel && (
                <div style={{
                  border: '2px solid #0f766e',
                  borderRadius: '0.4rem',
                  padding: '0.25rem 0.7rem',
                  backgroundColor: '#ecfdf5',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0f766e', fontFamily: 'monospace', margin: 0 }}>
                    Estacionamiento
                  </p>
                  <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f766e', margin: 0 }}>
                    {sectorLabel}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer — person + QR */}
          <div style={{
            marginTop: 'auto', backgroundColor: '#0f766e', borderRadius: '0.5rem',
            padding: '0.5rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
          }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a7f3d0', fontFamily: 'monospace', margin: 0 }}>
                Titular
              </p>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vehicle?.person_name || '—'}
              </p>
            </div>
            <div style={{ flexShrink: 0, backgroundColor: 'white', borderRadius: '0.3rem', padding: '0.15rem' }}>
              <QRCodeSVG value={vehicle?.id || vehicle?.plate || ''} size={56} level="M" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}