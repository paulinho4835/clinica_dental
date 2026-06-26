"use client";

import { useState } from "react";
import { X, Copy, Check, ExternalLink, PhoneOff } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { Button } from "@/components/ui/Button";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { normalizePhone } from "@/lib/phone-utils";
import { createPatientIntakeInvitation } from "@/app/(dashboard)/pacientes/anamnesis-invitation-actions";

export function NewPatientInviteModal({
  clinicName,
  onClose,
}: {
  clinicName: string;
  onClose: () => void;
}) {
  useDismissable(onClose);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!phone.trim()) {
      setError("Ingresa el celular del paciente.");
      return;
    }
    setError(null);
    setLoading(true);
    const res = await createPatientIntakeInvitation({ phone, name });
    setLoading(false);
    if (res.ok) setUrl(`${window.location.origin}${res.url}`);
    else setError(res.error);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciónalo y cópialo manualmente.");
    }
  }

  const normalized = normalizePhone(phone);
  const waLink =
    url && normalized
      ? `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(
          `Hola${name ? ` ${name}` : ""}, bienvenido/a a ${clinicName}. ` +
            `Para registrarse, complete sus datos aquí:\n${url}\n\n` +
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
            <h2 className="font-semibold text-slate-800">
              Registrar paciente por WhatsApp
            </h2>
            <p className="text-xs text-slate-500">
              El paciente completa sus datos; tú los apruebas para crearlo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!url ? (
            <>
              <label className="block">
                <FieldLabel>Celular del paciente *</FieldLabel>
                <input
                  className={fieldInputClass}
                  placeholder="Ej: 70012345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="block">
                <FieldLabel>Nombre (opcional)</FieldLabel>
                <input
                  className={fieldInputClass}
                  placeholder="Para personalizar el mensaje"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button type="button" onClick={generate} disabled={loading}>
                {loading ? "Generando…" : "Generar enlace"}
              </Button>
            </>
          ) : (
            <>
              <label className="text-xs font-medium uppercase text-slate-400">
                Enlace de registro
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
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Enviar por WhatsApp
                </a>
              ) : (
                <p className="flex items-center gap-2 rounded-md border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400">
                  <PhoneOff className="h-3.5 w-3.5 shrink-0" />
                  Celular inválido para WhatsApp. Copia el enlace y envíalo manualmente.
                </p>
              )}

              <p className="text-[11px] text-slate-400">
                Cuando el paciente lo complete, aparecerá en “Registros entrantes”
                para que lo apruebes. Vence en 7 días.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
