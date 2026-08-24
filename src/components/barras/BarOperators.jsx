import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Pencil, Ban, KeyRound, Wine } from 'lucide-react';
import BarOperatorModal from './BarOperatorModal';

export default function BarOperators() {
  const { toast } = useToast();
  const [operators, setOperators] = useState([]);
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { editing } | null

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [opsRes, barList] = await Promise.all([
        base44.functions.invoke('manageBarOperator', { action: 'list' }),
        base44.entities.Bar.list('name', 500),
      ]);
      const opsData = opsRes?.data ?? opsRes;
      if (opsData?.error) throw new Error(opsData.error);
      setOperators(opsData.operators || []);
      setBars((barList || []).filter((b) => b.status === 'active'));
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (data) => {
    if (data.editing) {
      const payload = { action: 'update', user_id: data.userId, bar_id: data.bar_id, blocked: data.blocked };
      const res = await base44.functions.invoke('manageBarOperator', payload);
      const body = res?.data ?? res;
      if (body?.error) throw new Error(body.error);
      if (data.changePw && data.password) {
        const pw = await base44.functions.invoke('manageBarOperator', { action: 'password', user_id: data.userId, newPassword: data.password });
        const pwBody = pw?.data ?? pw;
        if (pwBody?.error) throw new Error(pwBody.error);
      }
    } else {
      const res = await base44.functions.invoke('manageBarOperator', {
        action: 'create', username: data.username, password: data.password, bar_id: data.bar_id,
      });
      const body = res?.data ?? res;
      if (body?.error) throw new Error(body.error);
      if (body?.passwordWarning) toast({ title: 'Atención', description: body.passwordWarning, variant: 'destructive' });
    }
    setModal(null);
    await load();
    toast({ title: 'Operador guardado', description: data.editing ? 'Los cambios se guardaron.' : `Usuario "${data.username}" creado.` });
  };

  const toggleBlock = async (op) => {
    try {
      const res = await base44.functions.invoke('manageBarOperator', { action: 'update', user_id: op.id, blocked: !op.blocked });
      const body = res?.data ?? res;
      if (body?.error) throw new Error(body.error);
      setOperators((prev) => prev.map((o) => (o.id === op.id ? { ...o, blocked: !op.blocked } : o)));
    } catch (e) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Operadores de barra</h2>
          <p className="text-sm text-slate-500">Usuarios que se loguean en la tablet con usuario y contraseña para usar el POS.</p>
        </div>
        <button onClick={() => setModal({ editing: null })} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Nuevo operador
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
      ) : operators.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Wine className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Sin operadores de barra. Creá el primero con "Nuevo operador".</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Barra asignada</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operators.map((op) => (
                <tr key={op.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{op.username || op.full_name}</p>
                    {op.company && <p className="text-xs text-slate-400">{op.company}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{op.bar_name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {op.blocked ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">Bloqueado</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Activo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggleBlock(op)} title={op.blocked ? 'Desbloquear' : 'Bloquear'}
                        className={`grid h-8 w-8 place-items-center rounded-lg border ${op.blocked ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100' : 'border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-600'}`}>
                        <Ban className="h-4 w-4" />
                      </button>
                      <button onClick={() => setModal({ editing: op })} title="Editar" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <BarOperatorModal
          open
          onClose={() => setModal(null)}
          onSaved={save}
          bars={bars}
          editing={modal.editing}
        />
      )}
    </div>
  );
}