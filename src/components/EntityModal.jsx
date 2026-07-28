import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, Loader2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AddressInput from '@/components/AddressInput';
import FaceCapture from '@/components/FaceCapture';

/**
 * EntityModal — generic entity form modal.
 *
 * KEY FIX: Uses a ref to track the latest form data so that onFieldChange
 * callbacks always receive fresh data, not stale state from the render closure.
 * This fixes the person→accreditation inheritance bugs where access_area and
 * event_phases were lost when setField was called multiple times in the same tick.
 */
export default function EntityModal({
  open,
  onClose,
  title,
  kicker = 'EDITAR REGISTRO',
  fields = [],
  initialData = {},
  onSubmit,
  onDelete,
  canDelete = false,
  submitLabel = 'Guardar',
  topContent,
  validate,
  onFieldChange,
}) {
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const dataRef = useRef({});

  useEffect(() => {
    if (open) {
      setData(initialData || {});
      dataRef.current = initialData || {};
      setError('');
      setErrors({});
    }
  }, [open, initialData]);

  if (!open) return null;

  const setField = (name, value) => {
    const next = { ...dataRef.current, [name]: value };
    dataRef.current = next;
    setData(next);
    setErrors((e) => ({ ...e, [name]: undefined }));
    if (onFieldChange) onFieldChange(name, value, setField, next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    if (validate) {
      const validationErrors = validate(dataRef.current);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setSaving(false);
        return;
      }
    }
    setErrors({});
    try {
      const cleanData = Object.fromEntries(
        Object.entries(dataRef.current).filter(([k]) => !k.startsWith('_search_'))
      );
      await onSubmit(cleanData);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
    setSaving(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el registro.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f) => {
    const value = data[f.name] ?? f.defaultValue ?? '';
    const fieldError = errors[f.name];
    const common = {
      id: f.name,
      value: f.type === 'checkbox' ? undefined : value,
      checked: f.type === 'checkbox' ? !!value : undefined,
      onChange: (e) => setField(f.name, f.type === 'checkbox' ? e.target.checked : e.target.value),
      required: f.required,
      className: `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
        fieldError
          ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/20'
          : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20'
      }`,
    };

    if (f.type === 'select') {
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <select {...common} disabled={f.disabled}>
            <option value="">{f.placeholder || 'Seleccionar…'}</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (f.type === 'toggle-group') {
      const raw = data[f.name];
      const selectedValues = Array.isArray(raw) ? raw : (raw ? String(raw).split(',').map((v) => v.trim()).filter(Boolean) : []);
      return (
        <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <div className="flex flex-wrap gap-2">
            {(f.options || []).map((o) => {
              const active = selectedValues.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? selectedValues.filter((v) => v !== o.value)
                      : [...selectedValues, o.value];
                    setField(f.name, next);
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (f.type === 'searchable-select') {
      const selectedOption = (f.options || []).find((o) => o.value === data[f.name]);
      const searchQuery = data[`_search_${f.name}`] || '';
      const showResults = searchQuery && !selectedOption;
      const filteredOptions = (f.options || []).filter((o) =>
        o.label.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 10);

      return (
        <div key={f.name} className="relative" style={{ gridColumn: f.full ? 'span 2' : undefined }}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <input
            type="text"
            value={selectedOption ? selectedOption.label : searchQuery}
            onChange={(e) => {
              setField(f.name, '');
              setField(`_search_${f.name}`, e.target.value);
            }}
            placeholder={f.placeholder || 'Buscar…'}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          {selectedOption && (
            <p className="mt-1 text-xs font-medium text-emerald-600">✓ {selectedOption.label}</p>
          )}
          {showResults && filteredOptions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {filteredOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setField(f.name, o.value);
                    setField(`_search_${f.name}`, '');
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-emerald-50"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {showResults && filteredOptions.length === 0 && (
            <p className="mt-1 text-xs text-slate-400">Sin resultados.</p>
          )}
        </div>
      );
    }

    if (f.type === 'image-upload') {
      const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError('');
        try {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          setField(f.name, file_url);
        } catch (err) {
          setError('No se pudo subir la imagen.');
        } finally {
          setUploading(false);
        }
      };

      return (
        <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}</span>
          {value && (
            <div className="mb-2">
              <img src={value} alt="Vista previa" className="h-24 rounded-lg object-contain" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Subiendo…' : (value ? 'Cambiar' : 'Subir imagen')}
              <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={uploading} />
            </label>
            {value && (
              <button type="button" onClick={() => setField(f.name, '')} className="text-xs text-red-500 hover:underline">
                Quitar
              </button>
            )}
          </div>
        </div>
      );
    }

    if (f.type === 'textarea') {
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <textarea {...common} rows={3} />
        </label>
      );
    }

    if (f.type === 'checkbox') {
      return (
        <label key={f.name} className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" {...common} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
          <span className="text-sm font-medium text-slate-700">{f.label}</span>
        </label>
      );
    }

    if (f.type === 'date') {
      const val = value ? String(value).slice(0, 10) : '';
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <input type="date" {...common} value={val} />
        </label>
      );
    }

    if (f.type === 'datetime-local') {
      const val = value ? String(value).slice(0, 16) : '';
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <input type="datetime-local" {...common} value={val} />
        </label>
      );
    }

    if (f.type === 'address') {
      const latField = f.latField || `${f.name}_lat`;
      const lngField = f.lngField || `${f.name}_lng`;
      return (
        <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <AddressInput
            value={value}
            onChange={(val) => setField(f.name, val)}
            lat={data[latField]}
            lng={data[lngField]}
            onCoordinatesChange={(latVal, lngVal) => {
              setField(latField, latVal);
              setField(lngField, lngVal);
            }}
            placeholder={f.placeholder || 'Buscar dirección…'}
            required={f.required}
            disabled={f.disabled}
          />
        </div>
      );
    }

    if (f.type === 'dni') {
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <input
            type="text"
            inputMode="numeric"
            value={String(value || '').replace(/\D/g, '')}
            onChange={(e) => setField(f.name, e.target.value.replace(/\D/g, ''))}
            placeholder={f.placeholder || 'Ej: 12345678'}
            required={f.required}
            maxLength={8}
            className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
              fieldError
                ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20'
            }`}
          />
        </label>
      );
    }

    if (f.type === 'phone-ar') {
      const v = String(value || '');
      const displayValue = v.startsWith('54') ? v.slice(2) : v;
      return (
        <label key={f.name} className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
          <div className="flex">
            <span className={`inline-flex items-center rounded-l-lg border border-r-0 px-3 py-2.5 text-sm font-semibold text-slate-600 ${
              errors[f.name] ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
            }`}>+54</span>
            <input
              type="tel"
              value={displayValue}
              onChange={(e) => {
                let cleaned = e.target.value.replace(/\D/g, '');
                if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                if (cleaned.startsWith('15')) cleaned = cleaned.slice(2);
                setField(f.name, '54' + cleaned);
              }}
              placeholder="Ej: 11 12345678"
              required={f.required}
              className={`w-full rounded-r-lg border px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                errors[f.name]
                  ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20'
              }`}
            />
          </div>
        </label>
      );
    }

    if (f.type === 'face-capture') {
      const photoUrl = data['face_photo_url'];
      const handleFaceCaptured = async (file, desc) => {
        if (!desc) {
          setError('No se detectó un rostro humano.');
          return;
        }
        setUploading(true);
        setError('');
        try {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          setField('face_photo_url', file_url);
          setField('face_descriptor', desc);
        } catch {
          setError('No se pudo subir la foto.');
        } finally {
          setUploading(false);
        }
      };
      return (
        <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}</span>
          {photoUrl ? (
            <div className="flex items-center gap-4">
              <img src={photoUrl} alt="Rostro capturado" className="h-24 rounded-lg object-cover" />
              <button type="button" onClick={() => { setField('face_photo_url', ''); setField('face_descriptor', null); }} className="text-xs text-red-500 hover:underline">
                Volver a capturar
              </button>
            </div>
          ) : uploading ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-slate-500">Procesando…</span>
            </div>
          ) : (
            <FaceCapture onCaptured={handleFaceCaptured} />
          )}
        </div>
      );
    }

    return (
      <label key={f.name} className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}{f.required && ' *'}</span>
        <input type={f.type || 'text'} {...common} placeholder={f.placeholder || ''} />
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600">{kicker}</p>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {topContent && <div className="mb-2">{topContent}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
                {renderField(f)}
                {errors[f.name] ? (
                  <p className="mt-1 text-xs font-medium text-red-600">{errors[f.name]}</p>
                ) : f.hint ? (
                  <p className="mt-1 text-xs text-slate-400">{f.hint}</p>
                ) : null}
              </div>
            ))}
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div>
              {canDelete && onDelete && (
                <button type="button" onClick={handleDelete} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}