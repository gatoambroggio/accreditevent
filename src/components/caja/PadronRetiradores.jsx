import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Pencil, Trash2, Users, Search } from 'lucide-react';
import WithdrawOperatorModal from './WithdrawOperatorModal';

export default function PadronRetiradores({ eventId, event }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);

  const load = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const r = await base44.entities.WithdrawOperator.filter({ event_id: eventId }, 'last_name', 500);
      setList(r || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  const filtered = list.filter((o) => {
    const s = `${o.first_name} ${o.last_name} ${o.dni}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const remove = async (o) => {
    if (!confirm(`¿Eliminar a ${o.first_name} ${o.last_name} del padrón?`)) return;
    try {
      await base44.entities.WithdrawOperator.delete(o.id);
      setList(list.filter((x) => x.id !== o.id));
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Users className="h-4 w-4" /></span>
          <div>
            <h3 className="text-base font-bold text-slate-900">Padrón de retiradores</h3>
            <p className="text-xs text-slate-500">
              {event?.name ? `${event.name} · ` : ''}{list.length} cargados · el POS autocompleta el nombre por DNI
            </p>
          </div>
        </div>
        <button
          onClick={() => setModal({ mode: 'new' })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          {list.length === 0
            ? 'Todavía no cargaste retiradores. Cargalos acá para que el POS autocomplete por DNI.'
            : 'No hay coincidencias con la búsqueda.'}
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
          {filtered.map((o) => (
            <div key={o.id} className="flex items-center justify-between border-b border-slate-50 px-3 py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{o.last_name}, {o.first_name}</p>
                <p className="text-xs text-slate-400">DNI {o.dni}{o.status === 'inactive' ? ' · inactivo' : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setModal({ mode: 'edit', op: o })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <WithdrawOperatorModal
          eventId={eventId}
          event={event}
          existing={list}
          op={modal.mode === 'edit' ? modal.op : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}