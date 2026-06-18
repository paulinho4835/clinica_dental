"use client";

import { useActionState, useEffect, useRef } from "react";
import { Trash2, UserPlus } from "lucide-react";
import {
  addReceptionista,
  removeReceptionista,
  type ActionState,
} from "@/app/(dashboard)/ajustes/recepcionistas-actions";
import { fieldInputClass } from "@/components/ui/Field";
import { toast } from "@/lib/toast";

export type ReceptionistaRow = { id: string; name: string };

const initial: ActionState = {};

export function ReceptionistasPanel({
  receptionistas,
}: {
  receptionistas: ReceptionistaRow[];
}) {
  const [state, formAction, pending] = useActionState(addReceptionista, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast("Recepcionista agregada", "success");
      formRef.current?.reset();
    }
    if (state.error) toast(state.error, "error");
  }, [state]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar a "${name}" de la lista?`)) return;
    const res = await removeReceptionista(id);
    if (res.error) toast(res.error, "error");
    else toast("Recepcionista eliminada", "success");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {receptionistas.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-400">
          No hay recepcionistas configuradas. Agrega la primera abajo.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {receptionistas.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium text-slate-800">{r.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(r.id, r.name)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="flex gap-2 border-t border-slate-100 px-4 py-3"
      >
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="Nombre de la recepcionista…"
          className={`${fieldInputClass} flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md bg-clinic px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {pending ? "Agregando…" : "Agregar"}
        </button>
      </form>
    </div>
  );
}
