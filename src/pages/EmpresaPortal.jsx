import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import {
  Loader2, Upload, FileText, Building2, Users, UserPlus, Pencil, Trash2,
  FileSpreadsheet, CheckCircle2, LogOut, ShieldCheck,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import DocumentViewer from '@/components/DocumentViewer';
import EmployeeFormModal from '@/components/empresa/EmployeeFormModal';
import EmployeeExcelImport from '@/components/empresa/EmployeeExcelImport';
import SearchInput from '@/components/ui/search-input';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { btnPrimary, btnOutline, btnIcon } from '@/components/ui/button-styles';

const DOC_TYPES = {
  work_insurance: 'Seguro de trabajo',
  tax_certificate: 'Constancia fiscal',
  contract: 'Contrato',
  other: 'Otro',
};

export default function EmpresaPortal() {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);

  const companyName = user?.company || user?.data?.company || '';

  const load = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      const comp = me?.company || me?.data?.company || '';
      if (!comp) { setLoading(false); return; }
      const companies = await base44.entities.ProviderCompany.filter({ name: comp });
      if (companies[0]) setCompany(companies[0]);
      const [emps, docs] = await Promise.all([
        base44.entities.Person.filter({ company: comp }, '-created_date', 500),
        base44.entities.Document.filter({ company: comp }, '-created_date', 100),
      ]);
      setEmployees(emps);
      setDocuments(docs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterType !== 'all') {
      list = list.filter((e) => (e.employment_type || 'fijo') === filterType);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((e) => `${e.full_name} ${e.document || ''} ${e.email || ''}`.toLowerCase().includes(q));
    }
    return list;
  }, [employees, search, filterType]);

  const stats = useMemo(() => ({
    total: employees.length,
    fijos: employees.filter((e) => (e.employment_type || 'fijo') === 'fijo').length,
    eventuals: employees.filter((e) => e.employment_type === 'eventual').length,
  }), [employees]);

  const handleSaveEmployee = async (data) => {
    if (editingEmployee) {
      const updated = await base44.entities.Person.update(editingEmployee.id, data);
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      await logAudit('empresa-update-employee', 'Person', updated.id, data.full_name);
      setMsg('Empleado actualizado.');
    } else {
      const created = await base44.entities.Person.create(data);
      setEmployees((prev) => [created, ...prev]);
      await logAudit('empresa-create-employee', 'Person', created.id, data.full_name);
      setMsg('Empleado cargado correctamente.');
    }
    setEditingEmployee(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleDeleteEmployee = async (emp) => {
    if (!window.confirm(`¿Eliminar a ${emp.full_name}?`)) return;
    await base44.entities.Person.delete(emp.id);
    setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    await logAudit('empresa-delete-employee', 'Person', emp.id, emp.full_name);
    setMsg('Empleado eliminado.');
    setTimeout(() => setMsg(''), 3000);
  };

  const handleImport = async (rows) => {
    const created = await base44.entities.Person.bulkCreate(rows);
    setEmployees((prev) => [...created, ...prev]);
    await logAudit('empresa-import-employees', 'Person', '', `${rows.length} empleados`);
  };

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    const file = e.target.elements.file.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Document.create({
        company: companyName,
        person_name: companyName,
        document_type: e.target.elements.document_type.value,
        original_name: file.name,
        file_url,
        mime_type: file.type,
        size: file.size,
        status: 'pending',
        expires_at: e.target.elements.expires_at.value || null,
      });
      await logAudit('empresa-upload-doc', 'Document', '', file.name);
      e.target.reset();
      await load();
      setMsg('Documento enviado para revisión.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message || 'Error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    await base44.entities.Document.delete(doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!companyName) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)] px-5">
        <div className="max-w-md text-center">
          <Building2 className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">No tenés una empresa asignada</h1>
          <p className="mt-2 text-sm text-slate-500">Contactate con el administrador para vincular tu cuenta a una empresa.</p>
          <button onClick={() => base44.auth.logout(window.location.href)} className="mt-6 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cerrar sesión</button>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">acceso</span>
          </div>
          <button onClick={() => base44.auth.logout(window.location.href)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-8">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Portal de empresa</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">{companyName}</h1>
          <p className="mt-2 text-sm text-emerald-100">Gestioná tus empleados, cargá documentación y prepará todo para la acreditación.</p>
          <div className="mt-5 flex flex-wrap gap-4">
            <div className="rounded-lg bg-white/10 px-4 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Total</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-4 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Fijos</p>
              <p className="text-xl font-bold text-white">{stats.fijos}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-4 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Eventuales</p>
              <p className="text-xl font-bold text-white">{stats.eventuals}</p>
            </div>
          </div>
        </div>

        {msg && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> {msg}
          </div>
        )}

        {/* Employees */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Users className="h-5 w-5 text-emerald-600" /> Empleados
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setEditingEmployee(null); setFormOpen(true); }} className={btnPrimary}>
                <UserPlus className="h-4 w-4" /> Nuevo empleado
              </button>
              <button onClick={() => setImportOpen(true)} className={btnOutline}>
                <FileSpreadsheet className="h-4 w-4" /> Importar Excel
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="max-w-xs flex-1">
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, DNI o email…" />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500">
              <option value="all">Todos</option>
              <option value="fijo">Fijos</option>
              <option value="eventual">Eventuales</option>
            </select>
          </div>

          <DataTable
            isEmpty={filtered.length === 0}
            emptyIcon={Users}
            emptyMessage={search || filterType !== 'all' ? 'Sin resultados.' : 'No hay empleados cargados. Agregá el primero o importá desde Excel.'}
            tableClassName="min-w-[640px]"
          >
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <Th>Nombre</Th>
                <Th>DNI</Th>
                <Th>Contacto</Th>
                <Th>Tipo</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <Tr key={emp.id}>
                  <Td>
                    <p className="text-sm font-semibold text-slate-900">{emp.full_name}</p>
                    {emp.notes && <p className="text-xs text-slate-400">{emp.notes}</p>}
                  </Td>
                  <Td className="text-sm text-slate-500">{emp.document || '—'}</Td>
                  <Td className="text-sm text-slate-500">
                    {emp.phone && <p>{emp.phone}</p>}
                    {emp.email && <p className="text-xs text-slate-400">{emp.email}</p>}
                    {!emp.phone && !emp.email && '—'}
                  </Td>
                  <Td>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${(emp.employment_type || 'fijo') === 'fijo' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                      {(emp.employment_type || 'fijo') === 'fijo' ? 'Fijo' : 'Eventual'}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => { setEditingEmployee(emp); setFormOpen(true); }} className={btnIcon} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDeleteEmployee(emp)} className="rounded-md border border-slate-200 bg-white p-1.5 text-red-500 transition hover:bg-red-50" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>

        {/* Insurance documents */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Upload */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Cargar seguros / documentación
            </h3>
            <form onSubmit={handleUploadDoc} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo</span>
                <select name="document_type" required defaultValue="work_insurance" className={inputCls}>
                  {Object.entries(DOC_TYPES).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Vencimiento (opcional)</span>
                <input name="expires_at" type="date" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Archivo — PDF, JPG o PNG (máx. 10 MB)</span>
                <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required
                  className="w-full rounded-lg border border-slate-200 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700" />
              </label>
              <button type="submit" disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Subiendo…' : 'Subir documento'}
              </button>
            </form>
          </div>

          {/* Document list */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <FileText className="h-5 w-5 text-emerald-600" /> Documentación enviada
            </h3>
            {documents.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No cargaste documentación todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Tipo</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Archivo</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Vence</th>
                      <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} className="border-b border-slate-50">
                        <td className="px-3 py-3 text-sm text-slate-600">{DOC_TYPES[d.document_type] || d.document_type}</td>
                        <td className="px-3 py-3">
                          <button onClick={() => setViewingDoc(d)} className="text-left text-sm text-emerald-700 hover:underline">{d.original_name}</button>
                          {d.review_note && <p className="text-xs text-slate-400">{d.review_note}</p>}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-500">{d.expires_at || '—'}</td>
                        <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                        <td className="px-3 py-3 text-right">
                          <button onClick={() => handleDeleteDoc(d)} className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <EmployeeFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingEmployee(null); }}
        onSubmit={handleSaveEmployee}
        editing={editingEmployee}
        companyName={companyName}
      />
      <EmployeeExcelImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        companyName={companyName}
      />
      <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />
    </div>
  );
}