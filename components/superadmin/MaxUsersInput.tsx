"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { setMaxUsers } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

export function MaxUsersInput({
  clinicId,
  maxUsers,
  currentCount,
}: {
  clinicId: string;
  maxUsers: number;
  currentCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setMaxUsers, initial);
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
        title="Cambiar límite de usuarios"
        className="group flex items-center gap-1 text-xs text-slate-500 hover:text-clinic"
      >
        <span className={currentCount >= maxUsers ? "font-semibold text-red-600" : ""}>
          {currentCount}
        </span>
        <span className="text-slate-400">/</span>
        <span>{maxUsers}</span>
        <span className="text-slate-400">usuario{maxUsers !== 1 ? "s" : ""}</span>
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
        name="maxUsers"
        type="number"
        min="1"
        defaultValue={maxUsers}
        className="w-16 rounded border border-clinic px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-clinic"
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
