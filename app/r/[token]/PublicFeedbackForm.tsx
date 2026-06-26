"use client";

import { useActionState, useState, startTransition } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { COMFORT_OPTIONS } from "@/lib/schemas/work-feedback";
import { submitWorkFeedback, type SubmitFeedbackState } from "./submit-action";

const initial: SubmitFeedbackState = {};

export function PublicFeedbackForm({
  token,
  clinicName,
  doctorName,
  patientName,
}: {
  token: string;
  clinicName: string;
  doctorName: string;
  patientName: string;
}) {
  const action = submitWorkFeedback.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comfort, setComfort] = useState("");
  const [comment, setComment] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit() {
    if (rating < 1) {
      setLocalError("Por favor toque las estrellas para calificar.");
      return;
    }
    setLocalError(null);
    const fd = new FormData();
    fd.append("rating", String(rating));
    fd.append("comfort", comfort);
    fd.append("comment", comment);
    startTransition(() => formAction(fd));
  }

  if (state.ok) {
    const first = patientName.split(" ")[0];
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800">
          ¡Gracias{first ? `, ${first}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Su opinión nos ayuda a mejorar. Ya puede cerrar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      <header className="mb-8 text-center">
        <p className="text-sm font-medium text-clinic">{clinicName}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          ¿Cómo fue su atención?
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {doctorName
            ? `Cuéntenos cómo fue su experiencia con ${doctorName}. Toma menos de un minuto.`
            : "Cuéntenos cómo fue su experiencia. Toma menos de un minuto."}
        </p>
      </header>

      {/* Estrellas */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="mb-4 font-semibold text-slate-800">
          Su calificación general
        </h2>
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} estrella${n !== 1 ? "s" : ""}`}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={`h-10 w-10 ${
                    active
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300"
                  }`}
                />
              </button>
            );
          })}
        </div>
        {rating > 0 && (
          <p className="mt-3 text-sm font-medium text-slate-500">
            {rating} de 5 estrellas
          </p>
        )}
      </section>

      {/* Cómo se sintió */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-slate-800">
          ¿Cómo se sintió durante la atención?
        </h2>
        <p className="mb-4 text-xs text-slate-400">Opcional.</p>
        <div className="flex flex-wrap justify-between gap-2">
          {COMFORT_OPTIONS.map((o) => {
            const selected = comfort === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setComfort(selected ? "" : o.key)}
                className={`flex flex-1 min-w-[5rem] flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition ${
                  selected
                    ? "border-clinic bg-clinic/5 text-slate-800"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">{o.emoji}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Comentario */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <label className="block text-sm text-slate-600">
          ¿Algo que quiera contarnos? (opcional)
          <textarea
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            rows={3}
            placeholder="Su comentario nos ayuda a mejorar."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
      </section>

      {(state.error || localError) && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {localError ?? state.error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-clinic px-4 py-3 text-sm font-semibold text-white hover:bg-clinic-fg disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar mi calificación"}
      </button>
    </div>
  );
}
