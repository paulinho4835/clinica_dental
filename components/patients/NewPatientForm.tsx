"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";

const initial: ActionState = {};

export function NewPatientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPatient, initial);
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
        + Nuevo paciente
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
        <Field name="full_name" label="Nombre completo *" required />
        <Field name="phone" label="Teléfono" />
        <Field name="dob" label="Fecha de nacimiento" type="date" />
        <Field name="email" label="Email" type="email" />
        <Field name="sex" label="Sexo" />
        <Field name="address" label="Dirección" />
        <Field name="allergies" label="Alergias (separadas por coma)" />
        <Field name="medical_alerts" label="Alertas médicas (coma)" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
    </label>
  );
}
