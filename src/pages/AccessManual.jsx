import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isWithinEventPhases, speakResult } from '@/lib/accessUtils';
import { canAccessZone } from '@/lib/accessZones';
import { Search, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';

export default function AccessManual() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [zone, setZone] = useState('');

  useEffect(() => {
    base44.entities.Event.filter({ status: 'active' }, '-created_date', 50).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!search || search.length < 3) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const accrs = await base44.entities.Accreditation.filter(
          { event_id: selectedEvent?.id },
          '-created_date',
          500
        );
        const q = search.toLowerCase();
        setResults(accrs.filter((a) =>
          a.person_name?.toLowerCase().includes(q) || a.badge_code?.toLowerCase().includes(q)
        ).slice(0, 10));
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedEvent]);

  const handleAccess = async (accreditation, forceGrant = false) => {
    let ok = false;
    let message = '';

    if (accreditation.status !== 'active') {
      message = 'Acreditación ' + accreditation.status;
    } else if (zone && !canAccessZone(accreditation.access_level, zone)) {
      message = 'Zona no autorizada';
    } else if (!isWithinEventPhases(selectedEvent, accreditation.event_phases)) {
      message = 'Fuera de rango horario';
    } else {
      ok = true;
      message = 'Acceso permitido';
    }

    speakResult(ok);
    try {
      await base44.entities.AccessLog.create({
        accreditation_id: accreditation.id,
        person_name: accreditation.person_name,
        badge_code: accreditation.badge_code,
        event_id: selectedEvent.id,
        event_name: selectedEvent.name,
        company: selectedEvent.company,
        method: 'manual',
        resource_type: 'person',
        zone: zone || '',
        result: ok ? 'granted' : 'denied',
        access_level: accreditation.access_level || '',
      });
    } catch {}
    alert(`${ok ? '✓' : '✗'} ${accreditation.person_name}\n${message}`);
  };

  if (!selectedEvent) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Control de acceso" title="Control manual" />
        <p className="text-sm text-slate-500">Seleccioná el evento para continuar.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((ev) => (
            <button key={ev.id} onClick={() => setSelectedEvent(ev)}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
              <p className="font-bold text-slate-900">{ev.name}</p>
              <p className="mt-1 text-xs text-slate-400">{ev.venue || 'Sin sede'}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => setSelectedEvent(null)}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3 w-3" /> Cambiar evento
          </button>
          <h1 className="text-2xl font-extrabold text-slate-900">{selectedEvent.name}</h1>
          <p className="text-sm text-slate-500">Control manual de acceso</p>
        </div>
        <select value={zone} onChange={(e) => setZone(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none">
          <option value="">Todas las zonas</option>
          <option value="general">General</option>
          <option value="backstage">Backstage</option>
          <option value="technical">Técnica</option>
          <option value="vip">VIP</option>
          <option value="all-access">All Access</option>
        </select>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o código de credencial…" />

      <div className="space-y-2">
        {results.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="font-semibold text-slate-900">{a.person_name}</p>
              <p className="text-xs text-slate-400">
                <span className="font-mono font-bold">{a.badge_code}</span> · {a.access_level} · {a.status}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleAccess(a, true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Permitir
              </button>
            </div>
          </div>
        ))}
        {search.length >= 3 && results.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">Sin resultados.</p>
        )}
      </div>
    </div>
  );
}