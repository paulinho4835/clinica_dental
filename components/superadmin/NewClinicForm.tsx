"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClinic } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: string };
const initial: State = {};

export function NewClinicForm() {
  const [state, formAction, pending] = useActionState(createClinic, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field name="clinicName" label="Nombre de la clínica *" required />
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Plan</span>
          <select
            name="plan"
            defaultValue="starter"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <Field name="adminName" label="Nombre del admin *" required />
        <Field name="adminEmail" label="Email del admin *" type="email" required />
      </div>

      <p className="rounded-lg bg-clinic/5 px-3 py-2 text-xs text-slate-500">
        Se enviará un correo de invitación al admin para que cree su propia
        contraseña y active su cuenta.
      </p>

      {/* Add-on WhatsApp */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100">
        <input
          type="checkbox"
          name="whatsapp_addon"
          value="true"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-green-600"
        />
        <div>
          <span className="text-sm font-medium text-slate-700">
            Activar módulo WhatsApp
          </span>
          <p className="text-xs text-slate-500">
            Habilita el botón de recordatorios por WhatsApp en la agenda de esta clínica.
          </p>
        </div>
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear clínica e invitar admin"}
      </button>
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
