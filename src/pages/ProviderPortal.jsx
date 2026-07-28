import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { CalendarDays, FileText, ScanFace, IdCard, LogOut, UserCircle } from 'lucide-react';
import FaceCapture from '@/components/FaceCapture';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime } from '@/lib/formatDate';

export default function ProviderPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('events');
  const [accreditations, setAccreditations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [biometrics, setBiometrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [accs, docs, bios] = await Promise.all([
          base44.entities.Accreditation.filter({ person_email: user?.email }, '-created_date', 50),
          base44.entities.Document.filter({}, '-created_date', 50).then((all) => all.filter((d) => d.person_name && accs.some((a) => a.person_name === d.person_name))),
          base44.entities.Biometric.filter({}, '-created_date', 50).then((all) => all.filter((b) => b.person_name && accs.some((a) => a.person_name === b.person_name))),
        ]);
        setAccreditations(accs);
        setDocuments(docs);
        setBiometrics(bios);
      } catch {}
      setLoading(false);
    })();
  }, [user]);

  const handleCapture = async (file, descriptor) => {
    if (!descriptor) { alert('No se detectó un rostro.'); return; }
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const acc = accreditations[0];
      if (acc) {
        await base44.entities.Biometric.create({
          accreditation_id: acc.id,
          person_id: acc.person_id,
          person_name: acc.person_name,
          event_id: acc.event_id,
          company: acc.company,
          face_photo_url: file_url,
          face_descriptor: Array.from(descriptor),
          status: 'active',
        });
        await base44.entities.Accreditation.update(acc.id, { has_biometric: true });
      }
      setCaptureOpen(false);
      window.location.reload();
    } catch { alert('No se pudo guardar la biometría.'); }
  };

  const hasBiometric = biometrics.length > 0;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserCircle className="h-8 w-8 text-emerald-400" />
            <div>
              <p className="font-bold">{user?.full_name || 'Proveedor'}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => logout()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20">
            <LogOut className="h-4 w-4" /> Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 space-y-6">
        <div className="flex gap-2 border-b border-slate-200">
          {[
            { key: 'events', label: 'Mis eventos', icon: CalendarDays },
            { key: 'accreditations', label: 'Credenciales', icon: IdCard },
            { key: 'documents', label: 'Documentos', icon: FileText },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition ${
                  tab === t.key ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'events' && (
          <div className="space-y-3">
            {accreditations.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No tenés eventos asignados.</p>
            ) : (
              accreditations.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{a.event_name}</p>
                      <p className="text-xs text-slate-400">Credencial: {a.badge_code} · Área: {a.access_level}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'accreditations' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ScanFace className="h-8 w-8 text-emerald-600" />
                  <div>
                    <p className="font-bold text-slate-900">Biometría facial</p>
                    <p className="text-xs text-slate-400">{hasBiometric ? 'Registrada' : 'Pendiente de registro'}</p>
                  </div>
                </div>
                {hasBiometric ? (
                  <StatusBadge status="active" />
                ) : (
                  <button onClick={() => setCaptureOpen(true)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Registrar
                  </button>
                )}
              </div>
            </div>
            {accreditations.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-900">{a.badge_code}</p>
                <p className="text-xs text-slate-400">{a.event_name} · {a.access_level}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-3">
            {documents.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No hay documentos cargados.</p>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="font-semibold text-slate-900">{d.document_type}</p>
                        {d.expires_at && <p className="text-xs text-slate-400">Vence: {d.expires_at}</p>}
                      </div>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {captureOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Captura facial</h2>
            <FaceCapture onCaptured={handleCapture} />
            <button onClick={() => setCaptureOpen(false)} className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}