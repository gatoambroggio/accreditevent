import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Send, Mail } from 'lucide-react';
import PageHeader from '@/components/ui/page-header';

export default function Messages() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    base44.entities.User.list('-created_date', 200).then(setUsers).catch(() => {});
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSend = async () => {
    if (!subject || !body || selected.length === 0) return;
    setSending(true);
    try {
      const recipients = users.filter((u) => selected.includes(u.id));
      for (const r of recipients) {
        try {
          await base44.integrations.Core.SendEmail({
            to: r.email,
            subject,
            body,
          });
        } catch {}
      }
      setSent(true);
      setSubject('');
      setBody('');
      setSelected([]);
      setTimeout(() => setSent(false), 3000);
    } catch {}
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="Comunicación" title="Mensajes">
        <button onClick={handleSend} disabled={sending || !subject || !body || selected.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50">
          <Send className="h-4 w-4" /> {sending ? 'Enviando…' : sent ? '✓ Enviado' : 'Enviar'}
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">Mensaje</h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Asunto</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cuerpo (HTML)</span>
              <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-400">Solo se pueden enviar emails a usuarios registrados en la app.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Destinatarios ({selected.length})</h2>
            <button onClick={() => setSelected(selected.length === users.length ? [] : users.map((u) => u.id))}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
              {selected.length === users.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </button>
          </div>
          <div className="max-h-[400px] space-y-1 overflow-y-auto">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSelect(u.id)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{u.full_name || u.email}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}