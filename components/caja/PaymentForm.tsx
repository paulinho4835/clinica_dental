"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerPayment, type ActionState } from "@/app/(dashboard)/caja/actions";

const initial: ActionState = {};

export function PaymentForm({ patients }: { patients: { id: string; full_name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(registerPayment, initial);
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
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
      >
        + Registrar pago
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Paciente *</span>
          <select name="patient_id" required defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="" disabled>Seleccionar…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Monto *</span>
          <input name="amount" type="number" step="0.01" min="0.01" required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Método</span>
          <select name="method" defaultValue="cash"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Tipo</span>
          <select name="kind" defaultValue="payment"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
            <option value="payment">Pago</option>
            <option value="credit">Saldo a favor</option>
          </select>
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
