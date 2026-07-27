import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, X, Download, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportToExcel } from '@/lib/exportUtils';
import { useAuth } from '@/lib/AuthContext';
import { getUserCompany } from '@/lib/userCompany';
import PageHeader from '@/components/ui/page-header';
import SearchInput from '@/components/ui/search-input';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnOutline } from '@/components/ui/button-styles';

const STATUS_LABELS = {
  pending: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  approved: { label: 'Aprobado', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export default function ProviderRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [reqs, evs] = await Promise.all([
          base44.entities.ProviderRequest.list('-created_date', 500),
          base44.entities.Event.list('-start_at', 200),
        ]);
        setRequests(reqs);
        setEvents(evs);
      } catch {}
      setLoading(false);
    })();

    const unsubscribe = base44.entities.ProviderRequest.subscribe(() => {
      base44.entities.ProviderRequest.list('-created_date', 500).then(setRequests).catch(() => {});
    });
    return unsubscribe;
  }, []);

  const userCompany = getUserCompany(user);

  const filtered = useMemo(() => {
    let result = requests;
    if (user?.role === 'productora' && userCompany) {
      result = result.filter((r) => r.company === userCompany);
    }
    if (eventFilter) {
      result = result.filter((r) => r.event_id === eventFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter((r) => `${r.person_name} ${r.event_name}`.toLowerCase().includes(q));
    }
    return result;
  }, [requests, query, eventFilter, user, userCompany]);

  const handleStatusChange = async (id, status) => {
    try {
      await base44.entities.ProviderRequest.update(id, { status });
    } catch {}
  };

  const handleExport = () => {
    const rows = [];
    filtered.forEach((r) => {
      const items = r.items || [];
      if (items.length === 0) {
        rows.push([r.event_name || '', r.person_name || '', '', '', '', r.status || '']);
      } else {
        items.forEach((it) => {
          rows.push([
            r.event_name || '',
            r.person_name || '',
            it.item_name || '',
            it.category || '',
            it.requires_quantity === false ? 'Sí' : `${it.quantity || 0} ${it.unit || ''}`.trim(),
            r.status || '',
          ]);
        });
      }
    });
    exportToExcel(['Evento', 'Proveedor', 'Ítem', 'Categoría', 'Cantidad', 'Estado'], rows, 'solicitudes-proveedores');
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Logística" title="Solicitudes de proveedores">
        <button onClick={handleExport} className={btnOutline}>
          <Download className="h-4 w-4" /> Exportar
        </button>
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por proveedor o evento…" />
        <FilterSelect value={eventFilter} onChange={setEventFilter} placeholder="Todos los eventos">
          {events.map((e) => ({ value: e.id, label: e.name }))}
        </FilterSelect>
      </div>

      <DataTable
        loading={loading}
        isEmpty={filtered.length === 0}
        emptyIcon={ClipboardCheck}
        emptyMessage="No hay solicitudes registradas."
        tableClassName="min-w-[720px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Proveedor</Th>
            <Th>Evento</Th>
            <Th>Ítems</Th>
            <Th>Estado</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const st = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
            return (
              <Tr key={r.id}>
                <Td className="text-sm font-semibold text-slate-900">{r.person_name}</Td>
                <Td className="text-sm text-slate-500">{r.event_name}</Td>
                <Td className="text-sm text-slate-500">{(r.items || []).length} ítem(s)</Td>
                <Td>
                  <select
                    value={r.status}
                    onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${st.cls} outline-none`}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="approved">Aprobado</option>
                    <option value="rejected">Rechazado</option>
                  </select>
                </Td>
                <Td className="text-right">
                  <button onClick={() => setSelected(r)} className="text-xs font-semibold text-emerald-600 hover:underline">
                    Ver detalle
                  </button>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>

      {selected && (
        <RequestDetailModal request={selected} onClose={() => setSelected(null)} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

const ITEM_STATUS_CLS = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
};

function RequestDetailModal({ request, onClose, onStatusChange }) {
  const [adminNotes, setAdminNotes] = useState(request.admin_notes || '');
  const [items, setItems] = useState(
    (request.items || []).map((it) => ({ ...it, status: it.status || 'pending' }))
  );
  const [saving, setSaving] = useState(false);

  const setItemStatus = (idx, status) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status } : it)));
  };

  const overallStatus = useMemo(() => {
    if (items.length === 0) return 'pending';
    if (items.every((it) => it.status === 'approved')) return 'approved';
    if (items.every((it) => it.status === 'rejected')) return 'rejected';
    return 'pending';
  }, [items]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.ProviderRequest.update(request.id, {
        admin_notes: adminNotes,
        items,
        status: overallStatus,
      });
      onStatusChange(request.id, overallStatus);
      onClose();
    } catch {}
    setSaving(false);
  };

  const grouped = useMemo(() => {
    const map = {};
    items.forEach((it, idx) => {
      const cat = it.category || 'Sin categoría';
      if (!map[cat]) map[cat] = [];
      map[cat].push({ ...it, _idx: idx });
    });
    return map;
  }, [items]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Solicitud de logística</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{request.person_name}</h2>
            <p className="text-sm text-slate-400">{request.event_name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</p>
              <div className="space-y-1.5">
                {catItems.map((it) => (
                  <div key={it._idx} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{it.item_name}</p>
                      <p className="text-sm text-slate-500">{it.quantity || 1} {it.unit || ''}</p>
                      {it.notes && <p className="text-xs text-slate-400">{it.notes}</p>}
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ITEM_STATUS_CLS[it.status]}`}>
                        {STATUS_LABELS[it.status]?.label || 'Pendiente'}
                      </span>
                      <button
                        onClick={() => setItemStatus(it._idx, 'approved')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold transition ${it.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => setItemStatus(it._idx, 'rejected')}
                        className={`rounded-md px-2 py-1 text-xs font-semibold transition ${it.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {request.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Notas del proveedor</p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{request.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Notas del administrador</p>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Observaciones internas…"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Estado global</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_LABELS[overallStatus]?.cls || STATUS_LABELS.pending.cls}`}>
              {STATUS_LABELS[overallStatus]?.label || 'Pendiente'}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cerrar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}