import React, { useState, useEffect, useMemo } from 'react';
import { X, Users, UserPlus, Link2, Search, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AdminEmployeeImportModal from '@/components/AdminEmployeeImportModal';
import CompanyDocUploadModal from '@/components/CompanyDocUploadModal';

export default function ProviderCompanyPeopleModal({ company, onClose }) {
  const [people, setPeople] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [linking, setLinking] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [events, setEvents] = useState([]);

  const loadPeople = async () => {
    try {
      const linked = await base44.entities.Person.filter({ company: company.name }, '-created_date', 500);
      setPeople(linked);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadPeople();
    const unsubscribe = base44.entities.Person.subscribe((event) => {
      if (event.type === 'create' || event.type === 'update' || event.type === 'delete') {
        loadPeople();
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.name]);

  const loadAllForSearch = async () => {
    try {
      const data = await base44.entities.Person.list('-created_date', 500);
      setAllPeople(data);
    } catch {}
  };

  useEffect(() => {
    loadAllForSearch();
    base44.entities.Event.list('-start_at', 200).then(setEvents).catch(() => {});
  }, []);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase().trim();
    return allPeople
      .filter((p) => p.company !== company.name)
      .filter((p) => `${p.full_name} ${p.document || ''} ${p.email || ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allPeople, search, company.name]);

  const handleLink = async (person) => {
    setLinking(person.id);
    try {
      await base44.entities.Person.update(person.id, { company: company.name });
      setSearch('');
    } catch {}
    setLinking(null);
  };

  const handleImport = async (rows, companyName, eventId) => {
    const ev = events.find((e) => e.id === eventId);
    const enrichedRows = rows.map((r) => ({
      ...r,
      company: companyName,
      event_ids: eventId ? [eventId] : [],
      event_names: eventId ? [ev?.name] : [],
      productora: ev?.company || '',
    }));
    await base44.entities.Person.bulkCreate(enrichedRows);
    loadPeople();
  };

  const handleUnlink = async (person) => {
    if (!window.confirm(`¿Desvincular a ${person.full_name} de ${company.name}?`)) return;
    try {
      await base44.entities.Person.update(person.id, { company: '' });
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">Personas vinculadas</p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{company.name}</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Stats + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <Users className="h-3.5 w-3.5" />
              {loading ? '…' : people.length} {people.length === 1 ? 'persona' : 'personas'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <FileSpreadsheet className="h-4 w-4" /> Importar Excel
              </button>
              <button type="button" onClick={() => setDocOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">
                <FileText className="h-4 w-4" /> Subir documento
              </button>
            </div>
          </div>

          {/* Link existing person */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <UserPlus className="h-3.5 w-3.5" /> Vincular persona existente
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, documento o email…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {search.trim() && (
              <div className="mt-2 space-y-1.5">
                {searchResults.length === 0 ? (
                  <p className="px-2 py-3 text-center text-sm text-slate-400">
                    {allPeople.length === 0 ? 'Cargando personas…' : 'Sin resultados o la persona ya está vinculada.'}
                  </p>
                ) : (
                  searchResults.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{p.full_name}</p>
                        <p className="text-xs text-slate-400">{p.document || 'Sin documento'} {p.company ? `· ${p.company}` : ''}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLink(p)}
                        disabled={linking === p.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {linking === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                        Vincular
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Linked people list */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">Personas en {company.name}</p>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : people.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                <Users className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No hay personas vinculadas todavía.</p>
              </div>
            ) : (
              <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
                {people.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.full_name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {p.document || 'Sin documento'} {p.email ? `· ${p.email}` : ''} {p.phone ? `· ${p.phone}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnlink(p)}
                      className="ml-2 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50"
                    >
                      Desvincular
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
            Cerrar
          </button>
        </div>
      </div>

      <AdminEmployeeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        companies={[company]}
        events={events}
        defaultCompany={company.name}
      />

      <CompanyDocUploadModal
        company={docOpen ? company : null}
        onClose={() => setDocOpen(false)}
      />
    </div>
  );
}