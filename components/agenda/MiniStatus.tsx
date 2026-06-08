"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentStatus } from "@/app/(dashboard)/agenda/actions";
import { toast } from "@/lib/toast";
import { RotateCcw, Check, X } from "lucide-react";

// ─── Control de asistencia (simple) ──────────────────────────────────────────
// Dos resultados: "Atendido" (vino → migra dinero al historial) o "No vino".
// Mientras está pendiente, muestra ambos botones; ya resuelto, muestra el
// resultado con opción de deshacer.
export function MiniStatus({
  id,
  status,
  canWrite,
}: {
  id: string;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(next: string) {
    start(async () => {
      const res = await setAppointmentStatus(id, next);
      if (res.error) toast(res.error, "error");
      else router.refresh();
    });
  }

  // Solo lectura para roles sin permiso.
  if (!canWrite) {
    const label =
      status === "finished" ? "Atendido" : status === "no_show" ? "No vino" : "Pendiente";
    const color =
      status === "finished"
        ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
        : status === "no_show"
          ? "bg-red-100 text-red-700 ring-red-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";
    return <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${color}`}>{label}</span>;
  }

  // Ya resuelto: muestra resultado + deshacer.
  if (status === "finished" || status === "no_show") {
    const done = status === "finished";
    return (
      <span className="flex items-center gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
            done
              ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
              : "bg-red-100 text-red-700 ring-red-200"
          }`}
        >
          {done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {done ? "Atendido" : "No vino"}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => set("scheduled")}
          aria-label="Deshacer"
          title="Deshacer"
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  // Pendiente: ofrece los dos resultados.
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => set("finished")}
        className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500 hover:text-white disabled:opacity-50"
      >
        <Check className="h-3 w-3" /> Atendido
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("no_show")}
        className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-50"
      >
        <X className="h-3 w-3" /> No vino
      </button>
    </span>
  );
}
