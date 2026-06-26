"use client";

import { useEffect, useRef, useState } from "react";
import {
  Star,
  X,
  Copy,
  Check,
  ExternalLink,
  PhoneOff,
  RefreshCw,
} from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { normalizePhone } from "@/lib/phone-utils";
import {
  createWorkFeedbackInvitation,
  type FeedbackInviteState,
} from "@/app/(dashboard)/mis-trabajos/feedback-actions";

export function RequestFeedbackButton({ workId }: { workId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pedir calificación"
        title="Pedir calificación al paciente"
        className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-500"
      >
        <Star className="h-4 w-4" />
      </button>
      {open && (
        <RequestFeedbackModal workId={workId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function RequestFeedbackModal({
  workId,
  onClose,
}: {
  workId: string;
  onClose: () => void;
}) {
  useDismissable(onClose);
  const [res, setRes] = useState<FeedbackInviteState | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function load(force: boolean) {
    setLoading(true);
    setError(null);
    setUrl(null);
    const r = await createWorkFeedbackInvitation(workId, force);
    if (r.ok) {
      setRes(r);
      setUrl(`${window.location.origin}${r.url}`);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }

  // Generar al abrir (una sola vez).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciónelo y cópielo manualmente.");
    }
  }

  const ok = res?.ok ? res : null;
  const normalized = normalizePhone(ok?.patientPhone ?? null);
  const firstName = (ok?.patientName ?? "").split(" ")[0];
  const waLink =
    url && normalized
      ? `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(
          `Hola${firstName ? ` ${firstName}` : ""}, gracias por su visita a ${
            ok?.clinicName ?? "la clínica"
          }. ` +
            `¿Nos ayuda con una breve calificación de su atención? Toma menos de un minuto:\n${url}\n\n` +
            `¡Gracias!`,
        )}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">Pedir calificación</h2>
            <p className="text-xs text-slate-500">
              Envíe este enlace al paciente para que califique su atención.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <p className="py-6 text-center text-sm text-slate-400">
              Generando enlace…
            </p>
          )}

          {error && !loading && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {url && !loading && (
            <>
              <label className="text-xs font-medium uppercase text-slate-400">
                Enlace de calificación
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                />
                <button
                  onClick={copy}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>

              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Enviar por WhatsApp
                </a>
              ) : (
                <p className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400">
                  <PhoneOff className="h-3.5 w-3.5 shrink-0" />
                  El paciente no tiene un teléfono válido. Copie el enlace y
                  envíelo manualmente.
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  Vence en 14 días y solo puede usarse una vez.
                </p>
                <button
                  onClick={() => load(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                >
                  <RefreshCw className="h-3 w-3" />
                  Generar enlace nuevo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
