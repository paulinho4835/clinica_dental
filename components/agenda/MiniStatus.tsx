"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentStatus } from "@/app/(dashboard)/agenda/actions";
import { toast } from "@/lib/toast";
import { RotateCcw, Check, X, Armchair, DoorOpen } from "lucide-react";

// ─── Control de flujo de la cita ─────────────────────────────────────────────
// Etapas progresivas y reversibles:
//   Pendiente → "Llegó" (en sala) → "En sillón" → "Atendido" / "No vino".
// "En sala" (waiting) y "En sillón" (in_chair) encienden indicadores en el bloque
// y los contadores de columna. "Atendido" migra el dinero al historial. Cualquier
// etapa se puede deshacer; los resultados (Atendido/No vino) tienen botón de
// deshacer que vuelve a Pendiente.
export function MiniStatus({
  id,
  status,
  canWrite,
  iconOnly = false,
}: {
  id: string;
  status: string;
  canWrite: boolean;
  iconOnly?: boolean;
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
      status === "finished"
        ? "Atendido"
        : status === "no_show"
          ? "No vino"
          : status === "in_chair"
            ? "En sillón"
            : status === "waiting"
              ? "En sala"
              : status === "confirmed"
                ? "Confirmada"
                : "Pendiente";
    const color =
      status === "finished"
        ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
        : status === "no_show"
          ? "bg-red-100 text-red-700 ring-red-200"
          : status === "in_chair"
            ? "bg-clinic/10 text-clinic ring-clinic/30"
            : status === "waiting"
              ? "bg-amber-100 text-amber-700 ring-amber-200"
              : status === "confirmed"
                ? "bg-sky-100 text-sky-700 ring-sky-200"
                : "bg-slate-100 text-slate-600 ring-slate-200";
    return <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${color}`}>{label}</span>;
  }

  const done = status === "finished";
  const resolved = done || status === "no_show";

  // Resultado final: muestra el resultado + deshacer.
  if (resolved) {
    const content = (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
          done
            ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
            : "bg-red-100 text-red-700 ring-red-200"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {!iconOnly && (done ? "Atendido" : "No vino")}
      </span>
    );
    return (
      <span className="flex items-center gap-1">
        {content}
        <button
          type="button"
          disabled={pending}
          onClick={() => set("scheduled")}
          aria-label="Deshacer"
          title="Deshacer"
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <RotateCcw className={iconOnly ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      </span>
    );
  }

  // ── Etapas previas al resultado ────────────────────────────────────────────
  // 0 = pendiente, 1 = en sala (waiting), 2 = en sillón (in_chair).
  const stage = status === "in_chair" ? 2 : status === "waiting" ? 1 : 0;
  const btn =
    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium disabled:opacity-50";

  return (
    <span className="flex flex-wrap items-center gap-1">
      {/* El paciente confirmó por WhatsApp: distintivo informativo. El flujo
          (Llegó → En sillón → Atendido) sigue disponible igual. */}
      {status === "confirmed" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
          <Check className="h-3 w-3" /> {!iconOnly && "Confirmada"}
        </span>
      )}

      {/* Etapa 1: Llegó / En sala */}
      <button
        type="button"
        disabled={pending}
        onClick={() => set(stage >= 1 ? "scheduled" : "waiting")}
        aria-pressed={stage >= 1}
        title={stage >= 1 ? "En sala (quitar)" : "Marcar que llegó"}
        className={`${btn} ${
          stage >= 1
            ? "border-amber-500 bg-amber-500 text-white"
            : "border-amber-300 text-amber-700 hover:bg-amber-500 hover:text-white"
        }`}
      >
        <DoorOpen className="h-3 w-3" /> {!iconOnly && (stage >= 1 ? "En sala" : "Llegó")}
      </button>

      {/* Etapa 2: En sillón */}
      <button
        type="button"
        disabled={pending}
        onClick={() => set(stage >= 2 ? "waiting" : "in_chair")}
        aria-pressed={stage >= 2}
        title={stage >= 2 ? "En sillón (quitar)" : "Pasar a sillón"}
        className={`${btn} ${
          stage >= 2
            ? "border-clinic bg-clinic text-white"
            : "border-clinic/40 text-clinic hover:bg-clinic hover:text-white"
        }`}
      >
        <Armchair className="h-3 w-3" /> {!iconOnly && "En sillón"}
      </button>

      {/* Resultado: Atendido */}
      <button
        type="button"
        disabled={pending}
        onClick={() => set("finished")}
        title="Atendido"
        className={`${btn} border-emerald-300 text-emerald-700 hover:bg-emerald-500 hover:text-white`}
      >
        <Check className="h-3 w-3" /> {!iconOnly && "Atendido"}
      </button>

      {/* Resultado: No vino */}
      <button
        type="button"
        disabled={pending}
        onClick={() => set("no_show")}
        title="No vino"
        className={`${btn} border-red-300 text-red-600 hover:bg-red-500 hover:text-white`}
      >
        <X className="h-3 w-3" /> {!iconOnly && "No vino"}
      </button>
    </span>
  );
}
