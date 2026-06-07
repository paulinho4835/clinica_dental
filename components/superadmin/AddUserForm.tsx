"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { addClinicUser } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: string };
const initial: State = {};

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "odontologo_general", label: "Odontólogo General" },
  { value: "especialista", label: "Especialista" },
  { value: "asistente", label: "Asistente" },
];

export function AddUserForm({ clinicId }: { clinicId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addClinicUser, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-clinic hover:text-clinic-fg"
      >
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {open ? "Cancelar" : "+ Añadir usuario"}
      </button>

      {open && (
        <form ref={formRef} action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="clinicId" value={clinicId} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field name="fullName" label="Nombre completo" required />
            <Field name="email" label="Email" type="email" required />
            <Field name="password" label="Contraseña inicial" type="text" required />
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Rol</span>
              <select
                name="role"
                defaultValue="recepcionista"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-clinic px-3 py-1.5 text-xs font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      )}
    </div>
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
    <label className="block text-xs">
      <span className="mb-1 block text-slate-500">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none"
      />
    </label>
  );
}
