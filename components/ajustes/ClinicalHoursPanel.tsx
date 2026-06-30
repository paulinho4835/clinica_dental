"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveClinicalHours, type ActionState } from "@/app/(dashboard)/ajustes/actions";

const initial: ActionState = {};

export function ClinicalHoursPanel({
  config,
  canWrite,
}: {
  config: { enabled: boolean; from: string; to: string };
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveClinicalHours, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form
      action={formAction}
      className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
    >
      <div className="space-y-4 p-5">
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="clinical_enabled"
            defaultChecked={config.enabled}
            disabled={!canWrite}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
          />
          <span className="text-slate-700">
            Activar el bloqueo. Fuera del horario, los doctores solo pueden
            <strong> leer</strong> el odontograma y la evolución (no editar).
          </span>
        </label>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500">
              Hora de apertura
            </label>
            <input
              type="time"
              name="clinical_from"
              defaultValue={config.from}
              disabled={!canWrite}
              className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">
              Hora de cierre
            </label>
            <input
              type="time"
              name="clinical_to"
              defaultValue={config.to}
              disabled={!canWrite}
              className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50"
            />
          </div>
        </div>

        <p className="text-xs text-slate-400">
          El administrador siempre puede editar, sin importar el horario. Las
          horas se interpretan en hora de Bolivia (America/La_Paz).
        </p>
      </div>

      {canWrite && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state.ok && !state.error && (
            <p className="text-sm text-emerald-600">Configuración guardada.</p>
          )}
          {!state.error && !state.ok && <span />}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      )}
    </form>
  );
}
