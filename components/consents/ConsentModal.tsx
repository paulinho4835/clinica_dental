"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SignaturePad, type SignaturePadRef } from "./SignaturePad";
import { createConsent } from "@/app/(dashboard)/pacientes/consent-actions";
import { fillPlaceholders, todayFormatted } from "@/lib/consent-utils";
import { useDismissable } from "@/components/ui/useDismissable";

export type ConsentTemplate = { id: string; title: string; body: string };
export type ConsentAppointment = { id: string; startsAt: string; reason: string | null };

export function ConsentModal({
  patientId,
  patientName,
  doctorName,
  clinicName,
  templates,
  appointments,
  onClose,
}: {
  patientId: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  templates: ConsentTemplate[];
  appointments: ConsentAppointment[];
  onClose: () => void;
}) {
  const router = useRouter();
  useDismissable(onClose);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);
  const padRef = useRef<SignaturePadRef>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? ""
  );
  const [title, setTitle] = useState(templates[0]?.title ?? "");
  const [body, setBody] = useState(() =>
    templates[0]
      ? fillPlaceholders(templates[0].body, {
          nombre_paciente: patientName,
          fecha: todayFormatted(),
          doctor: doctorName,
          clinica: clinicName,
        })
      : ""
  );
  const [appointmentId, setAppointmentId] = useState("");

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setTitle(tpl.title);
    setBody(
      fillPlaceholders(tpl.body, {
        nombre_paciente: patientName,
        fecha: todayFormatted(),
        doctor: doctorName,
        clinica: clinicName,
      })
    );
  }

  function handleSave(status: "pendiente" | "firmado") {
    setError(null);
    const signatureData =
      status === "firmado" && padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL()
        : null;

    if (status === "firmado" && !signatureData) {
      setError("Dibuja la firma en el canvas antes de guardar como firmado.");
      return;
    }

    startTransition(async () => {
      const result = await createConsent(patientId, {
        templateId: selectedTemplateId || null,
        title,
        body,
        appointmentId: appointmentId || null,
        signatureData,
        status,
      });
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  const fmtAppt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-BO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Nuevo consentimiento</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Plantilla */}
          {templates.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Plantilla</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          )}

          {/* Título */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Título</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
            />
          </label>

          {/* Cuerpo editable */}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Texto del consentimiento
              <span className="ml-1 font-normal text-slate-400">(editable)</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
            />
          </label>

          {/* Vincular a cita */}
          {appointments.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Vincular a cita
                <span className="ml-1 font-normal text-slate-400">(opcional)</span>
              </span>
              <select
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none"
              >
                <option value="">— Sin vincular —</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {fmtAppt(a.startsAt)}{a.reason ? ` — ${a.reason}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Firma digital */}
          <div className="text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-700">Firma digital</span>
              <button
                type="button"
                onClick={() => setShowPad((v) => !v)}
                className="text-xs text-clinic hover:underline"
              >
                {showPad ? "Ocultar" : "Firmar ahora"}
              </button>
            </div>
            {showPad && (
              <div className="space-y-2">
                <SignaturePad ref={padRef} />
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Limpiar firma
                </button>
              </div>
            )}
            {!showPad && (
              <p className="text-xs text-slate-400">
                Omite para guardar sin firma (se imprime línea en blanco).
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleSave("pendiente")}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? "…" : "Guardar sin firma"}
          </button>
          <button
            type="button"
            onClick={() => handleSave("firmado")}
            disabled={pending || !showPad}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "…" : "Guardar firmado"}
          </button>
        </div>
      </div>
    </div>
  );
}
