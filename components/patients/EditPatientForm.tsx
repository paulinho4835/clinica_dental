"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";

export interface PatientData {
  id: string;
  full_name: string;
  national_id?: string | null;
  dob?: string | null;
  sex?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  allergies?: string[] | null;
  medical_alerts?: string[] | null;
}

const initial: ActionState = {};

export function EditPatientForm({ patient }: { patient: PatientData }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const boundAction = updatePatient.bind(null, patient.id);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        Editar datos
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-4 space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="font-medium text-slate-800">Editar paciente</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="full_name" label="Nombre completo *" required defaultValue={patient.full_name} />
        <Field name="national_id" label="Cédula de identidad (CI)" defaultValue={patient.national_id} />
        <Field name="phone" label="Teléfono" defaultValue={patient.phone} />
        <Field name="dob" label="Fecha de nacimiento" type="date" defaultValue={patient.dob} />
        <Field name="email" label="Email" type="email" defaultValue={patient.email} />
        <Field name="sex" label="Sexo" defaultValue={patient.sex} />
        <Field name="address" label="Dirección" defaultValue={patient.address} />
        <Field
          name="allergies"
          label="Alergias (separadas por coma)"
          defaultValue={patient.allergies?.join(", ")}
        />
        <Field
          name="medical_alerts"
          label="Alertas médicas (coma)"
          defaultValue={patient.medical_alerts?.join(", ")}
        />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
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
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
    </label>
  );
}
