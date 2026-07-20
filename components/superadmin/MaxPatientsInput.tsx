"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil } from "lucide-react";
import { setMaxPatients } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

// Tope de pacientes por clínica (palanca de upsell manual del superadmin).
// null = sin tope: se muestra solo el conteo, sin fracción, invitando a
// activarlo con el mismo click de edición.
export function MaxPatientsInput({
  clinicId,
  maxPatients,
  currentCount,
}: {
  clinicId: string;
  maxPatients: number | null;
  currentCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setMaxPatients, initial);
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
    const overLimit = maxPatients !== null && currentCount >= maxPatients;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Cambiar tope de pacientes"
        className="group flex items-center gap-1 text-xs text-slate-500 hover:text-clinic"
      >
        <span className={overLimit ? "font-semibold text-red-600" : ""}>{currentCount}</span>
        {maxPatients !== null && (
          <>
            <span className="text-slate-400">/</span>
            <span>{maxPatients}</span>
          </>
        )}
        <span className="text-slate-400">paciente{currentCount !== 1 ? "s" : ""}</span>
        <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="clinicId" value={clinicId} />
      <span className="text-xs text-slate-500">{currentCount} /</span>
      <input
        ref={inputRef}
        name="maxPatients"
        type="number"
        min="0"
        defaultValue={maxPatients ?? ""}
        placeholder="sin tope"
        className="w-20 rounded border border-clinic px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-clinic"
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded p-0.5 text-clinic hover:bg-clinic/10 disabled:opacity-50"
        title="Guardar"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
