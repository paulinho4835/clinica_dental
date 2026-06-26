"use client";

import { useState, useTransition } from "react";
import { Check, X, CheckCircle2, XCircle } from "lucide-react";
import { respondToAppointment } from "./actions";

// Botones de confirmar / cancelar para el paciente. Mantiene el resultado en
// pantalla tras responder (sin necesidad de recargar) y bloquea la doble acción.
export function ConfirmActions({
  token,
  initialStatus,
  isPast,
}: {
  token: string;
  initialStatus: string;
  isPast: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Estados finales: ya no se muestran los botones, solo el resultado.
  if (status === "confirmed") {
    return (
      <Result
        tone="success"
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title="¡Cita confirmada!"
        message="Gracias por confirmar. ¡Te esperamos!"
      />
    );
  }
  if (status === "cancelled") {
    return (
      <Result
        tone="danger"
        icon={<XCircle className="h-10 w-10 text-rose-400" />}
        title="Cita cancelada"
        message="Avisamos a la clínica que no podrás asistir. Gracias por avisar."
      />
    );
  }
  if (["finished", "in_chair", "waiting"].includes(status)) {
    return (
      <Result
        tone="neutral"
        icon={<CheckCircle2 className="h-10 w-10 text-slate-400" />}
        title="Cita en curso"
        message="Esta cita ya está en proceso o fue atendida."
      />
    );
  }

  function respond(action: "confirm" | "cancel") {
    setError(null);
    startTransition(async () => {
      const res = await respondToAppointment(token, action);
      if (res.error) {
        setError(res.error);
        if (res.status) setStatus(res.status);
        return;
      }
      if (res.status) setStatus(res.status);
    });
  }

  return (
    <div className="mt-6 space-y-3">
      {isPast && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
          Esta cita ya pasó. Si necesitas una nueva, contacta a la clínica.
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => respond("confirm")}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
      >
        <Check className="h-5 w-5" />
        Confirmar asistencia
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => respond("cancel")}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-base font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <X className="h-5 w-5" />
        No podré asistir
      </button>

      {error && (
        <p className="text-center text-sm text-rose-500">{error}</p>
      )}
    </div>
  );
}

function Result({
  icon,
  title,
  message,
}: {
  tone: "success" | "danger" | "neutral";
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center text-center">
      {icon}
      <h2 className="mt-3 text-lg font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
    </div>
  );
}
