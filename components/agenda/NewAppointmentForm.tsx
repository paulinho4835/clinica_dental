"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointment, type ActionState } from "@/app/(dashboard)/agenda/actions";

const initial: ActionState = {};

type Option = { id: string; full_name?: string; name?: string };

export function NewAppointmentForm({
  patients,
  dentists,
  operatories,
}: {
  patients: Option[];
  dentists: Option[];
  operatories: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAppointment, initial);
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
        + Nueva cita
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
        <Select name="patient_id" label="Paciente *" required
          options={patients.map((p) => ({ value: p.id, label: p.full_name ?? "—" }))} />
        <Select name="dentist_id" label="Odontólogo *" required
          options={dentists.map((d) => ({ value: d.id, label: d.full_name ?? "—" }))} />
        <Select name="operatory_id" label="Sillón"
          options={operatories.map((o) => ({ value: o.id, label: o.name ?? "—" }))} allowEmpty />
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Inicio *</span>
          <input name="starts_at" type="datetime-local" required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Duración (min)</span>
          <input name="duration_min" type="number" defaultValue={30} min={5} step={5}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Motivo</span>
          <input name="reason" type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input name="overbooked" type="checkbox" /> Permitir sobre-cupo (ignora choque de horario)
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50">
          {pending ? "Guardando…" : "Agendar"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Select({
  name, label, options, required = false, allowEmpty = false,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <select name={name} required={required} defaultValue=""
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic">
        <option value="" disabled={required}>{allowEmpty ? "— Ninguno —" : "Seleccionar…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
