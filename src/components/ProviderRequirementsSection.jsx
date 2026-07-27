import React, { useState, useEffect, useMemo } from 'react';
import { Package, Loader2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ProviderRequirementsSection({ user }) {
  const [catalog, setCatalog] = useState([]);
  const [accreditations, setAccreditations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selected, setSelected] = useState({});
  const [quantities, setQuantities] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [generalNotes, setGeneralNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cat, accs, reqs] = await Promise.all([
          base44.entities.RequirementItem.list('name', 200),
          base44.entities.Accreditation.filter({ person_email: user.email }, '-created_date', 100),
          base44.entities.ProviderRequest.list('-created_date', 100),
        ]);
        const activeCat = cat.filter((c) => c.is_active !== false);
        setCatalog(activeCat);
        setAccreditations(accs.filter((a) => a.status === 'active'));
        setRequests(reqs);
        if (accs.length > 0) setSelectedEventId(accs[0].event_id);
      } catch {}
      setLoading(false);
    })();
  }, [user.email]);

  const currentRequest = useMemo(
    () => requests.find((r) => r.event_id === selectedEventId),
    [requests, selectedEventId]
  );

  useEffect(() => {
    if (currentRequest) {
      const sel = {};
      const qty = {};
      const notes = {};
      (currentRequest.items || []).forEach((it) => {
        sel[it.item_id] = true;
        qty[it.item_id] = it.quantity || 1;
        notes[it.item_id] = it.notes || '';
      });
      setSelected(sel);
      setQuantities(qty);
      setItemNotes(notes);
      setGeneralNotes(currentRequest.notes || '');
    } else {
      setSelected({});
      setQuantities({});
      setItemNotes({});
      setGeneralNotes('');
    }
    setSaved(false);
    setError('');
  }, [selectedEventId, currentRequest]);

  const groupedCatalog = useMemo(() => {
    const map = {};
    catalog.forEach((item) => {
      const cat = item.category || 'Sin categoría';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return map;
  }, [catalog]);

  const toggleItem = (id) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
    setSaved(false);
  };

  const setQty = (id, val) => {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Number(val) || 0) }));
    setSaved(false);
  };

  const setNote = (id, val) => {
    setItemNotes((n) => ({ ...n, [id]: val }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const acc = accreditations.find((a) => a.event_id === selectedEventId);
      if (!acc) throw new Error('No se encontró tu acreditación para este evento.');

      const items = catalog
        .filter((item) => selected[item.id])
        .map((item) => ({
          item_id: item.id,
          item_name: item.name,
          category: item.category || '',
          quantity: item.requires_quantity === false ? 1 : (quantities[item.id] || 1),
          unit: item.unit || 'Unidad',
          notes: itemNotes[item.id] || '',
        }));

      const payload = {
        event_id: selectedEventId,
        event_name: acc.event_name,
        company: acc.company,
        person_id: acc.person_id,
        person_name: acc.person_name,
        person_email: user.email,
        items,
        notes: generalNotes,
        status: currentRequest?.status || 'pending',
      };

      if (currentRequest) {
        await base44.entities.ProviderRequest.update(currentRequest.id, payload);
      } else {
        await base44.entities.ProviderRequest.create(payload);
      }

      const reqs = await base44.entities.ProviderRequest.list('-created_date', 100);
      setRequests(reqs);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la solicitud.');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (accreditations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
        <Package className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">No tenés eventos acreditados activos para solicitar requerimientos.</p>
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
        <Package className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">Todavía no hay ítems de logística configurados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Event selector */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Evento</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        >
          {accreditations.map((a) => (
            <option key={a.id} value={a.event_id}>{a.event_name}</option>
          ))}
        </select>
      </div>

      {/* Catalog grouped by category */}
      {Object.entries(groupedCatalog).map(([cat, items]) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</p>
          <div className="space-y-2">
            {items.map((item) => {
              const isSelected = !!selected[item.id];
              return (
                <div key={item.id} className={`rounded-lg border px-3 py-2.5 transition ${isSelected ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                    </div>
                    {isSelected && item.requires_quantity !== false && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={quantities[item.id] ?? 1}
                          onChange={(e) => setQty(item.id, e.target.value)}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <span className="text-xs text-slate-400">{item.unit || 'Unidad'}</span>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <input
                      type="text"
                      value={itemNotes[item.id] || ''}
                      onChange={(e) => setNote(item.id, e.target.value)}
                      placeholder="Notas para este ítem (opcional)…"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* General notes */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notas generales</label>
        <textarea
          value={generalNotes}
          onChange={(e) => { setGeneralNotes(e.target.value); setSaved(false); }}
          rows={2}
          placeholder="Comentarios adicionales para el equipo de logística…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Feedback + Save */}
      {saved && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> Solicitud guardada correctamente.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {currentRequest ? 'Actualizar solicitud' : 'Enviar solicitud'}
      </button>
    </div>
  );
}