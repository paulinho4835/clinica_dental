"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check, ExternalLink, PhoneOff, RefreshCw } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { normalizePhone } from "@/lib/phone-utils";
import { createAnamnesisInvitation } from "@/app/(dashboard)/pacientes/anamnesis-invitation-actions";

export function RequestAnamnesisModal({
  patientId,
  patientName,
  patientPhone,
  clinicName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  clinicName: string;
  onClose: () => void;
}) {
  useDismissable(onClose);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    createAnamnesisInvitation(patientId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setUrl(`${window.location.origin}${res.url}`);
        else setError(res.error);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [patientId]);

  async function regenerate() {
    setLoading(true);
    setError(null);
    setUrl(null);
    const res = await createAnamnesisInvitation(patientId, true);
    if (res.ok) setUrl(`${window.location.origin}${res.url}`);
    else setError(res.error);
    setLoading(false);
  }

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

  const normalized = normalizePhone(patientPhone);
  const waLink =
    url && normalized
      ? `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(
          `Hola ${patientName}, para agilizar su atención en ${clinicName}, ` +
            `por favor complete su historial clínico aquí:\n${url}\n\n` +
            `Es rápido y confidencial. ¡Gracias!`,
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
            <h2 className="font-semibold text-slate-800">Solicitar historial</h2>
            <p className="text-xs text-slate-500">
              Envíe este enlace al paciente para que complete su historial.
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

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {url && !loading && (
            <>
              <label className="text-xs font-medium uppercase text-slate-400">
                Enlace del formulario
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
                  Vence en 7 días y solo puede usarse una vez.
                </p>
                <button
                  onClick={regenerate}
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
