"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Vapi from "@vapi-ai/web";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";

type CallStatus = "idle" | "connecting" | "active" | "ended";

type TranscriptLine = {
  id: number;
  role: "user" | "assistant";
  text: string;
};

export default function DemoPage() {
  const searchParams = useSearchParams();
  const vapiRef = useRef<Vapi | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [clinicName, setClinicName] = useState("la clínica");
  const [error, setError] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);

  const clinicId = searchParams.get("clinicId") ?? "";

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  async function startCall() {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("NEXT_PUBLIC_VAPI_PUBLIC_KEY no configurada.");
      return;
    }

    setStatus("connecting");
    setTranscript([]);
    setError("");

    try {
      const params = new URLSearchParams();
      if (clinicId) params.set("clinicId", clinicId);
      const res = await fetch(`/api/demo/assistant?${params}`);
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Error al cargar el asistente");
      }
      const { clinicName: name, assistant } = await res.json();
      setClinicName(name);

      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setStatus("active"));
      vapi.on("call-end", () => {
        setStatus("ended");
        vapiRef.current = null;
      });
      vapi.on("error", (e: unknown) => {
        console.error("Vapi error", e);
        setError("Error en la llamada. Intenta de nuevo.");
        setStatus("idle");
        vapiRef.current = null;
      });
      vapi.on("message", (msg: Record<string, unknown>) => {
        if (msg.type === "transcript" && msg.transcriptType === "final") {
          const role = msg.role as "user" | "assistant";
          const text = msg.transcript as string;
          if (!text?.trim()) return;
          setTranscript((prev) => [
            ...prev,
            { id: ++lineId.current, role, text },
          ]);
        }
      });

      await vapi.start(assistant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setStatus("idle");
      vapiRef.current = null;
    }
  }

  function endCall() {
    vapiRef.current?.stop();
    setStatus("ended");
  }

  function toggleMute() {
    if (!vapiRef.current) return;
    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }

  function reset() {
    setStatus("idle");
    setTranscript([]);
    setError("");
    setIsMuted(false);
  }

  const isActive = status === "active";
  const isConnecting = status === "connecting";
  const isEnded = status === "ended";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full max-w-md">
        {/* Cabecera */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-clinic/20 ring-2 ring-clinic/30">
            <Phone className="h-7 w-7 text-clinic" />
          </div>
          <h1 className="text-2xl font-bold text-white">{clinicName}</h1>
          <p className="mt-1 text-sm text-slate-400">Recepcionista IA — Demo</p>
        </div>

        {/* Tarjeta principal */}
        <div className="rounded-2xl bg-slate-800/60 p-6 shadow-2xl ring-1 ring-slate-700 backdrop-blur">
          {/* Estado */}
          <div className="mb-5 flex items-center justify-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                isActive
                  ? "animate-pulse bg-emerald-400"
                  : isConnecting
                    ? "animate-pulse bg-amber-400"
                    : isEnded
                      ? "bg-slate-500"
                      : "bg-slate-600"
              }`}
            />
            <span className="text-sm font-medium text-slate-300">
              {isActive
                ? "En llamada"
                : isConnecting
                  ? "Conectando…"
                  : isEnded
                    ? "Llamada finalizada"
                    : "Lista para llamar"}
            </span>
          </div>

          {/* Transcripción */}
          {transcript.length > 0 && (
            <div className="mb-5 max-h-64 overflow-y-auto rounded-xl bg-slate-900/60 p-3 text-sm">
              {transcript.map((line) => (
                <div
                  key={line.id}
                  className={`mb-2 flex gap-2 ${line.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-1.5 leading-snug ${
                      line.role === "user"
                        ? "bg-clinic/80 text-white"
                        : "bg-slate-700 text-slate-200"
                    }`}
                  >
                    {line.role === "assistant" && (
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        IA
                      </span>
                    )}
                    {line.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}

          {transcript.length === 0 && !isConnecting && !isEnded && (
            <div className="mb-5 rounded-xl bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500">
              La transcripción aparecerá aquí durante la llamada.
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
              {error}
            </p>
          )}

          {/* Controles */}
          <div className="flex items-center justify-center gap-4">
            {!isActive && !isConnecting && !isEnded && (
              <button
                onClick={startCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-95"
                aria-label="Iniciar llamada"
              >
                <Phone className="h-7 w-7 text-white" />
              </button>
            )}

            {(isActive || isConnecting) && (
              <>
                <button
                  onClick={toggleMute}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                    isMuted
                      ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                  aria-label={isMuted ? "Activar micrófono" : "Silenciar"}
                >
                  {isMuted ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>

                <button
                  onClick={endCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/30 transition hover:bg-red-400 active:scale-95"
                  aria-label="Terminar llamada"
                >
                  <PhoneOff className="h-7 w-7 text-white" />
                </button>
              </>
            )}

            {isEnded && (
              <button
                onClick={reset}
                className="rounded-full bg-clinic px-6 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-clinic-fg"
              >
                Nueva llamada
              </button>
            )}
          </div>

          {!isActive && !isConnecting && !isEnded && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Presiona el botón verde y permite el acceso al micrófono
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          Demo — Recepcionista IA · Clínica Dental SaaS
        </p>
      </div>
    </div>
  );
}
