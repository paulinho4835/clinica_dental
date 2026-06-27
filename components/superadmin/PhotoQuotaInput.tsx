"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, X, Pencil } from "lucide-react";
import { setPhotoQuota } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

// Tope de fotos POR CLÍNICA (no por paciente). Solo se muestra cuando el addon
// "fotos" está encendido. El doctor se autogestiona dentro de este tope; si
// quiere más, el superadmin sube el número aquí.
export function PhotoQuotaInput({
  clinicId,
  quota,
}: {
  clinicId: string;
  quota: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setPhotoQuota, initial);
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
        title="Cambiar tope de fotos de la clínica"
        className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-200"
      >
        <Camera className="h-3.5 w-3.5 text-slate-400" />
        Tope: {quota.toLocaleString("es-BO")} fotos
        <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="clinicId" value={clinicId} />
      <Camera className="h-3.5 w-3.5 text-slate-400" />
      <input
        ref={inputRef}
        name="quota"
        type="number"
        min="0"
        step="100"
        defaultValue={quota}
        className="w-24 rounded border border-clinic px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-clinic"
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
