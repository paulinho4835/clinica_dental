"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { updateClinicName } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

export function EditClinicName({
  clinicId,
  name,
}: {
  clinicId: string;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateClinicName, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex items-center gap-1.5 font-semibold text-clinic-fg hover:text-clinic"
        title="Renombrar clínica"
      >
        {name}
        <Pencil className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input
        ref={inputRef}
        name="name"
        defaultValue={name}
        className="rounded border border-clinic px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-clinic"
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded p-1 text-clinic hover:bg-clinic/10 disabled:opacity-50"
        title="Guardar"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100"
        title="Cancelar"
      >
        <X className="h-4 w-4" />
      </button>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
