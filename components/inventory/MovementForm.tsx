"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerMovement, type ActionState } from "@/app/(dashboard)/inventario/actions";

const initial: ActionState = {};

export function MovementForm({ items }: { items: { id: string; name: string; unit: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(registerMovement, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg">
        + Movimiento de stock
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Insumo *</span>
          <select name="item_id" required defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="" disabled>Seleccionar…</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select name="type" defaultValue="in"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="in">Entrada</option>
            <option value="out">Salida</option>
            <option value="adjust">Ajuste (delta, puede ser negativo)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Cantidad *</span>
          <input name="quantity" type="number" step="0.01" required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Motivo</span>
          <input name="reason" type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50">
          {pending ? "Guardando…" : "Registrar"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}
