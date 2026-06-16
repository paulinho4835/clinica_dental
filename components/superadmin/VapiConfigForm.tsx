"use client";

import { useTransition, useState } from "react";
import { updateClinicVapiConfig } from "@/app/(dashboard)/superadmin/actions";
import type { VapiClinicConfig } from "@/lib/vapi";

const VOICES = [
  { id: "paula",     label: "Paula (femenina)" },
  { id: "bella",     label: "Bella (femenina, cálida)" },
  { id: "diego",     label: "Diego (masculino, formal)" },
  { id: "valentina", label: "Valentina (femenina, enérgica)" },
] as const;

type Status = "idle" | "saving" | "saved" | "error";

export function VapiConfigForm({
  clinicId,
  initial,
}: {
  clinicId: string;
  initial: VapiClinicConfig;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(initial.vapi_phone_number_id ?? "");
  const [voiceId, setVoiceId] = useState(initial.vapi_voice_id ?? "paula");
  const [firstMessage, setFirstMessage] = useState(initial.vapi_first_message ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      setStatus("saving");
      const result = await updateClinicVapiConfig(clinicId, {
        vapi_phone_number_id: phoneNumberId.trim() || undefined,
        vapi_voice_id: voiceId,
        vapi_first_message: firstMessage.trim() || undefined,
      });
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setErrorMsg(result.error ?? "Error desconocido");
        setStatus("error");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* ID de número Vapi */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          ID de número Vapi
        </label>
        <input
          type="text"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <p className="mt-0.5 text-[10px] text-slate-400">
          Cópialo desde Vapi Dashboard → Phone Numbers
        </p>
      </div>

      {/* Voz */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Voz de la recepcionista
        </label>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Saludo */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Saludo personalizado{" "}
          <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value.slice(0, 200))}
          placeholder="Hola, gracias por llamar a [nombre de la clínica]. ¿En qué puedo ayudarle?"
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <p className="mt-0.5 text-right text-[10px] text-slate-400">
          {firstMessage.length}/200
        </p>
      </div>

      {/* Botón + feedback */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-clinic px-4 py-1.5 text-xs font-medium text-white transition hover:bg-clinic-fg disabled:opacity-60"
        >
          {isPending ? "Guardando…" : "Guardar configuración Vapi"}
        </button>
        {status === "saved" && (
          <span className="text-xs text-emerald-600">Guardado</span>
        )}
        {status === "error" && (
          <span className="text-xs text-red-600">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
