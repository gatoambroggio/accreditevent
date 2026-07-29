import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Pencil, Loader2, X, GripVertical, Eye, EyeOff } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';
import FilterSelect from '@/components/ui/filter-select';
import DataTable, { Th, Td, Tr } from '@/components/ui/data-table';
import { slugify } from '@/lib/slugify';

const ENTITIES = [
  { value: 'Person', label: 'Personas' },
  { value: 'Event', label: 'Eventos' },
  { value: 'Accreditation', label: 'Acreditaciones' },
  { value: 'Vehicle', label: 'Vehículos' },
  { value: 'Document', label: 'Documentos' },
  { value: 'ProviderCompany', label: 'Empresas proveedoras' },
  { value: 'Biometric', label: 'Biometría' },
  { value: 'AccessLog', label: 'Registro de accesos' },
  { value: 'ZKTecoDevice', label: 'Dispositivos ZKTeco' },
  { value: 'ProviderRequest', label: 'Solicitudes de proveedores' },
  { value: 'RequirementItem', label: 'Ítems de logística' },
  { value: 'EventCompanyApproval', label: 'Aprobaciones de empresa' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'boolean', label: 'Sí / No' },
  { value: 'select', label: 'Lista desplegable' },
];

const EMPTY_FORM = {
  entity_name: 'Person',
  field_key: '',
  field_label: '',
  field_type: 'text',
  options: [],
  required: false,
  default_value: '',
  description: '',
  is_active: true,
  sort_order: 0,
};

export default function CustomFields() {
  const [entityFilter, setEntityFilter] = useState('Person');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newOption, setNewOption] = useState('');

  const loadFields = async (entityName) => {
    setLoading(true);
    try {
      const all = await base44.entities.CustomField.filter({ entity_name: entityName }, 'sort_order', 200);
      setFields(all);
    } catch {
      setFields([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFields(entityFilter);
  }, [entityFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, entity_name: entityFilter });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (field) => {
    setEditing(field);
    setForm({
      ...EMPTY_FORM,
      ...field,
      options: field.options || [],
    });
    setError('');
    setModalOpen(true);
  };

  const setVal = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addOption = () => {
    const label = newOption.trim();
    if (!label) return;
    setForm((f) => ({
      ...f,
      options: [...f.options, { value: slugify(label), label }],
    }));
    setNewOption('');
  };

  const removeOption = (idx) => {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.field_label.trim()) { setError('La etiqueta es obligatoria.'); return; }
    if (!form.field_key.trim()) {
      setVal('field_key', slugify(form.field_label));
    }
    const payload = {
      ...form,
      field_key: form.field_key.trim() || slugify(form.field_label),
      options: form.field_type === 'select' ? form.options : [],
    };
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await base44.entities.CustomField.update(editing.id, payload);
      } else {
        await base44.entities.CustomField.create(payload);
      }
      setModalOpen(false);
      loadFields(entityFilter);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el campo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field) => {
    if (!window.confirm(`¿Eliminar el campo "${field.field_label}"?`)) return;
    try {
      await base44.entities.CustomField.delete(field.id);
      loadFields(entityFilter);
    } catch {}
  };

  const toggleActive = async (field) => {
    try {
      await base44.entities.CustomField.update(field.id, { is_active: !field.is_active });
      loadFields(entityFilter);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Administración" title="Campos personalizados">
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          <Plus className="h-4 w-4" /> Nuevo campo
        </button>
      </PageHeader>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Agregá campos personalizados a cualquier entidad. Los campos aparecen automáticamente en los formularios
          y se guardan en el registro. Esto te permite adaptar el sistema sin tocar código.
        </p>
        <div className="mt-4 max-w-xs">
          <FilterSelect
            value={entityFilter}
            onChange={setEntityFilter}
            options={ENTITIES}
          />
        </div>
      </div>

      <DataTable
        loading={loading}
        isEmpty={fields.length === 0}
        emptyIcon={Plus}
        emptyMessage="No hay campos personalizados para esta entidad."
        tableClassName="min-w-[700px]"
      >
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <Th>Orden</Th>
            <Th>Etiqueta</Th>
            <Th>Clave</Th>
            <Th>Tipo</Th>
            <Th>Oblig.</Th>
            <Th>Activo</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, idx) => (
            <Tr key={f.id}>
              <Td>
                <div className="flex items-center gap-1 text-slate-400">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-xs">{f.sort_order ?? idx}</span>
                </div>
              </Td>
              <Td>
                <p className="text-sm font-semibold text-slate-900">{f.field_label}</p>
                {f.description && <p className="text-xs text-slate-400">{f.description}</p>}
              </Td>
              <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{f.field_key}</code></Td>
              <Td className="text-sm text-slate-600">
                {FIELD_TYPES.find((t) => t.value === f.field_type)?.label || f.field_type}
                {f.field_type === 'select' && f.options?.length > 0 && (
                  <span className="ml-1 text-xs text-slate-400">({f.options.length} opciones)</span>
                )}
              </Td>
              <Td>{f.required ? <span className="text-sm font-medium text-red-600">Sí</span> : <span className="text-sm text-slate-400">No</span>}</Td>
              <Td>
                <button onClick={() => toggleActive(f)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  {f.is_active ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </Td>
              <Td>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(f)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(f)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">CAMPO PERSONALIZADO</p>
                <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{editing ? 'Editar campo' : 'Nuevo campo'}</h2>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Entidad</span>
                  <select
                    value={form.entity_name}
                    onChange={(e) => setVal('entity_name', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {ENTITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de campo</span>
                  <select
                    value={form.field_type}
                    onChange={(e) => setVal('field_type', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {FIELD_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Etiqueta *</span>
                <input
                  type="text"
                  value={form.field_label}
                  onChange={(e) => {
                    setVal('field_label', e.target.value);
                    if (!editing) setVal('field_key', slugify(e.target.value));
                  }}
                  placeholder="Ej: Grupo sanguíneo"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Clave (identificador)</span>
                <input
                  type="text"
                  value={form.field_key}
                  onChange={(e) => setVal('field_key', slugify(e.target.value))}
                  placeholder="grupo_sanguineo"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="mt-1 text-xs text-slate-400">Se genera automáticamente desde la etiqueta.</p>
              </label>

              {form.field_type === 'select' && (
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Opciones</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                      placeholder="Escribí una opción y presioná Enter"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button type="button" onClick={addOption} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {form.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {form.options.map((o, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                          {o.label}
                          <button type="button" onClick={() => removeOption(i)} className="text-slate-400 hover:text-red-600">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Valor por defecto</span>
                  <input
                    type="text"
                    value={form.default_value || ''}
                    onChange={(e) => setVal('default_value', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Orden</span>
                  <input
                    type="number"
                    value={form.sort_order ?? 0}
                    onChange={(e) => setVal('sort_order', Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Descripción / ayuda</span>
                <input
                  type="text"
                  value={form.description || ''}
                  onChange={(e) => setVal('description', e.target.value)}
                  placeholder="Texto de ayuda para el usuario"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.required}
                    onChange={(e) => setVal('required', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-600">Obligatorio</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setVal('is_active', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-600">Activo</span>
                </label>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editing ? 'Guardar cambios' : 'Crear campo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}