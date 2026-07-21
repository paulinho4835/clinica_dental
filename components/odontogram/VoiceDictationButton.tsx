"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VoiceOperation } from "@/lib/odontogram/voice";
import { VoiceReviewDialog } from "./VoiceReviewDialog";

type Interpretation = { transcript: string; operations: VoiceOperation[]; uncertainties: string[]; warnings: string[] };

export function VoiceDictationButton({ patientId, onApply }: { patientId: string; onApply: (operations: VoiceOperation[]) => void }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<Interpretation | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const startedAt = useRef(0);
  const interpretationStartedAt = useRef<number | null>(null);
  const latencyMs = useRef<number | null>(null);

  useEffect(() => () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - startedAt.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function start() {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("Este navegador no permite grabar audio. Puedes usar la paleta manual."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false); setProcessing(true);
        const durationMs = Math.min(60_000, Date.now() - startedAt.current);
        try {
          interpretationStartedAt.current = performance.now();
          const form = new FormData(); form.set("audio", new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), "dictado.webm"); form.set("patientId", patientId); form.set("durationMs", String(durationMs));
          const response = await fetch("/api/odontogram/voice/interpret", { method: "POST", body: form, cache: "no-store" });
          const body = await response.json() as Interpretation & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "No se pudo interpretar el dictado.");
          latencyMs.current = interpretationStartedAt.current === null ? null : Math.round(performance.now() - interpretationStartedAt.current);
          setReview(body);
        } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo interpretar el dictado."); }
        finally { setProcessing(false); }
      };
      recorderRef.current = recorder; streamRef.current = stream; startedAt.current = Date.now(); setSeconds(0); recorder.start(); setRecording(true);
      stopTimerRef.current = window.setTimeout(stop, 60_000);
    } catch { setMessage("No se pudo acceder al micrófono. Puedes usar la paleta manual."); }
  }
  function stop() {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }
  function record(outcome: "applied" | "cancelled", appliedCount: number) {
    if (!review) return;
    void fetch("/api/odontogram/voice/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcriptCharCount: review.transcript.length, proposedCount: review.operations.length, appliedCount, uncertaintyCount: review.uncertainties.length, outcome, latencyMs: latencyMs.current }) });
  }
  function apply() { if (!review) return; record("applied", review.operations.length); onApply(review.operations); setReview(null); }

  return <div className="space-y-2"><div aria-live="polite" className="text-sm text-slate-600">{recording ? `Grabando ${seconds}s de 60s. El audio no se guarda.` : processing ? "Interpretando dictado…" : message}</div><button type="button" onClick={recording ? stop : start} disabled={processing} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{recording ? <><Square className="h-4 w-4" />Detener</> : <><Mic className="h-4 w-4" />Dictar cambios</>}</button>{review && <VoiceReviewDialog {...review} onRemove={(index) => setReview((previous) => previous ? { ...previous, operations: previous.operations.filter((_, i) => i !== index) } : null)} onApply={apply} onCancel={() => { record("cancelled", 0); setReview(null); }} />}</div>;
}
