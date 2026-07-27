import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/audit';
import { Loader2, Upload, FileText, IdCard, UserCircle, CheckCircle2, Car, Trash2, Plus } from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import PersonBiometricCard from '@/components/PersonBiometricCard';
import DocumentViewer from '@/components/DocumentViewer';

const DOC_TYPES = {
  dni: 'Documento de identidad',
  work_insurance: 'Seguro de trabajo',
  tax_certificate: 'Constancia fiscal',
  contract: 'Contrato',
  other: 'Otro',
};

export default function ProviderPortal() {
  const [person, setPerson] = useState(null);
  const [accreditations, setAccreditations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [msg, setMsg] = useState('');
  const [viewingDoc, setViewingDoc] = useState(null);

  const load = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      const people = await base44.entities.Person.filter({ email: me.email }, '-created_date', 5);
      const p = people[0];
      if (!p) { setLoading(false); return; }
      setPerson(p);
      const [accreds, docs, vehs] = await Promise.all([
        base44.entities.Accreditation.filter({ person_id: p.id }, '-created_date', 50),
        base44.entities.Document.filter({ person_id: p.id }, '-created_date', 50),
        base44.entities.Vehicle.filter({ person_id: p.id }, '-created_date', 50),
      ]);
      setAccreditations(accreds);
      setDocuments(docs);
      setVehicles(vehs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await base44.entities.Person.update(person.id, {
        phone: e.target.phone.value,
        email: e.target.email.value,
      });
      setPerson(updated);
      await logAudit('provider-update', 'Person', person.id, person.full_name);
      setMsg('Datos actualizados correctamente.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = e.target.elements.file.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Document.create({
        person_id: person.id,
        person_name: person.full_name,
        document_type: e.target.elements.document_type.value,
        original_name: file.name,
        file_url,
        mime_type: file.type,
        size: file.size,
        status: 'pending',
        expires_at: e.target.elements.expires_at.value || null,
      });
      await logAudit('document-upload', 'Document', '', file.name);
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

  const handleVehicleAdd = async (e) => {
    e.preventDefault();
    setSavingVehicle(true);
    try {
      await base44.entities.Vehicle.create({
        person_id: person.id,
        person_name: person.full_name,
        brand: e.target.elements.brand.value.trim(),
        model: e.target.elements.model.value.trim(),
        plate: e.target.elements.plate.value.toUpperCase().trim(),
        color: e.target.elements.color.value.trim(),
      });
      await logAudit('vehicle-create', 'Vehicle', '', e.target.elements.plate.value);
      e.target.reset();
      await load();
      setMsg('Vehículo registrado correctamente.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message || 'Error al registrar el vehículo.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleVehicleDelete = async (vehicleId) => {
    if (!window.confirm('¿Eliminar este vehículo?')) return;
    try {
      await base44.entities.Vehicle.delete(vehicleId);
      await load();
      setMsg('Vehículo eliminado.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message || 'Error al eliminar el vehículo.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(120_14%_97%)] px-4">
        <div className="max-w-md text-center">
          <UserCircle className="mx-auto h-12 w-12 text-slate-300" />
          <h2 className="mt-4 text-xl font-bold text-slate-900">No tenés un perfil de proveedor asociado</h2>
          <p className="mt-2 text-sm text-slate-500">Contactá al administrador para que cree tu persona y vincule tu cuenta.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(120_14%_97%)]">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(39_86%_63%)] text-sm font-extrabold text-[hsl(146_34%_11%)]">A</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">acceso</span>
          </div>
          <button onClick={() => base44.auth.logout(window.location.href)}
            className="text-sm font-medium text-slate-500 hover:text-slate-900">Cerrar sesión</button>
        </div>

        {/* Hero */}
        <div className="mb-8 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-8">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">Portal de proveedores</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">{person.full_name}</h1>
          <p className="mt-2 text-sm text-emerald-100">Actualizá tu contacto y cargá la documentación requerida para tu acreditación.</p>
        </div>

        {msg && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> {msg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Profile */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-bold text-slate-900">Mis datos de contacto</h3>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono</span>
                <input name="phone" defaultValue={person.phone || ''} type="tel"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email</span>
                <input name="email" defaultValue={person.email || ''} type="email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar datos'}
              </button>
            </form>
          </div>

          {/* Upload */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-bold text-slate-900">Subir documentación</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo</span>
                <select name="document_type" required defaultValue="work_insurance"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                  {Object.entries(DOC_TYPES).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Vencimiento (opcional)</span>
                <input name="expires_at" type="date"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Archivo — PDF, JPG o PNG (máx. 10 MB)</span>
                <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700" />
              </label>
              <button type="submit" disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Subiendo…' : 'Subir documento'}
              </button>
            </form>
          </div>
        </div>

        {/* Biometric */}
        <div className="mt-6">
          <PersonBiometricCard person={person} />
        </div>

        {/* Accreditations */}
        {accreditations.length > 0 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
              <IdCard className="h-4 w-4 text-emerald-600" /> Mis acreditaciones
            </h3>
            <div className="space-y-2">
              {accreditations.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-t border-slate-100 py-3 first:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{a.event_name}</p>
                    <p className="text-xs text-slate-400">{a.badge_code} · {a.area || 'Sin área'} · {a.access_level}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vehicles */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <Car className="h-4 w-4 text-emerald-600" /> Mis vehículos
          </h3>
          <form onSubmit={handleVehicleAdd} className="mb-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Marca *</span>
                <input name="brand" type="text" required placeholder="Ej: Ford"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Modelo *</span>
                <input name="model" type="text" required placeholder="Ej: Fiesta"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Patente *</span>
                <input name="plate" type="text" required placeholder="Ej: AB123CD"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm uppercase outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Color</span>
                <input name="color" type="text" placeholder="Ej: Blanco"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
              </label>
            </div>
            <button type="submit" disabled={savingVehicle}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {savingVehicle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {savingVehicle ? 'Guardando…' : 'Agregar vehículo'}
            </button>
          </form>
          {vehicles.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No registraste vehículos todavía.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between border-t border-slate-100 py-3 first:border-0">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider text-slate-700">
                      {v.plate}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{v.brand} {v.model}</p>
                      {v.color && <p className="text-xs text-slate-400">{v.color}</p>}
                    </div>
                  </div>
                  <button onClick={() => handleVehicleDelete(v.id)}
                    className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
            <FileText className="h-4 w-4 text-emerald-600" /> Mis documentos
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
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-sm text-slate-600">{DOC_TYPES[d.document_type] || d.document_type}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => setViewingDoc(d)} className="text-left text-sm text-emerald-700 hover:underline">
                          {d.original_name}
                        </button>
                        {d.review_note && <p className="text-xs text-slate-400">{d.review_note}</p>}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-500">{d.expires_at || '—'}</td>
                      <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />
    </div>
  );
}