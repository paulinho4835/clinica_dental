"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Inbox, Headset, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NewPatientInviteModal } from "@/components/patients/NewPatientInviteModal";
import { ReviewAnamnesisModal } from "@/components/patients/ReviewAnamnesisModal";
import { deletePendingIntakeInvitation } from "@/app/(dashboard)/pacientes/anamnesis-invitation-actions";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import type { Anamnesis } from "@/lib/schemas/anamnesis";
import type { PatientIntake } from "@/lib/schemas/patient-intake";
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";

export type IntakeItem = {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  completedAt: string | null;
  // Quién originó el registro: 'manual' (enlace enviado por el equipo) o
  // 'agente' (tomado por el Asistente Virtual en WhatsApp).
  source: string;
  personal: PatientIntake | null;
  proposed: { data: Anamnesis; allergies: string[]; alerts: string[] } | null;
  customAnswers: IntakeAnswerSnapshot[];
};

export function IncomingIntakesPanel({
  clinicName,
  ready,
  awaiting,
}: {
  clinicName: string;
  ready: IntakeItem[];
  awaiting: IntakeItem[];
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // La lista de "esperando respuesta" crece sin límite (un enlace por cada
  // paciente invitado que aún no completó el formulario) y no requiere
  // acción inmediata, a diferencia de "por revisar" — colapsada por defecto
  // para no empujar el resto de la página hacia abajo.
  const [awaitingOpen, setAwaitingOpen] = useState(false);

  const reviewItem = ready.find((r) => r.id === reviewId) ?? null;

  async function handleDelete(item: IntakeItem) {
    const who = item.contactName || item.contactPhone || "este paciente";
    const ok = await confirm({
      title: "Eliminar registro pendiente",
      message: `Se eliminará el enlace de registro enviado a ${who} y dejará de funcionar. ¿Continuar?`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(item.id);
    const res = await deletePendingIntakeInvitation(item.id);
    setDeletingId(null);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Registro pendiente eliminado.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Registros entrantes</h2>
        </div>
        <Button size="sm" type="button" onClick={() => setInviting(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Registrar por WhatsApp
        </Button>
      </div>

      {ready.length === 0 && awaiting.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Envía un enlace por WhatsApp y el paciente completará su registro. Cuando
          lo haga, aparecerá aquí para que lo apruebes.
        </p>
      )}

      {ready.length > 0 && (
        <div className="mt-3 space-y-2">
          {ready.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-clinic bg-clinic/5 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {r.personal?.full_name || r.contactName || "Paciente nuevo"}
                  </p>
                  {r.source === "agente" && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-clinic/10 px-2 py-0.5 text-[10px] font-medium text-clinic-700">
                      <Headset className="h-3 w-3" />
                      Asistente Virtual
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500">
                  {r.personal?.national_id ? `CI: ${r.personal.national_id} · ` : ""}
                  {r.contactPhone ?? r.personal?.phone ?? "Sin teléfono"}
                  {r.source === "agente" ? " · Registrado por el Asistente Virtual (WhatsApp)" : ""}
                </p>
              </div>
              <Button size="sm" type="button" onClick={() => setReviewId(r.id)}>
                Revisar
              </Button>
            </div>
          ))}
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAwaitingOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <span>
              {awaiting.length} enlace{awaiting.length !== 1 ? "s" : ""} enviado
              {awaiting.length !== 1 ? "s" : ""} esperando que el paciente complete.
            </span>
            {awaitingOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
          {awaitingOpen && (
            <div className="mt-2 space-y-2">
              {awaiting.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-600">
                      {a.contactName || "Sin nombre"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {a.contactPhone ?? "Sin teléfono"} · esperando respuesta
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    disabled={deletingId === a.id}
                    title="Eliminar este registro pendiente"
                    className="shrink-0 rounded-md p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {inviting && (
        <NewPatientInviteModal
          clinicName={clinicName}
          onClose={() => setInviting(false)}
        />
      )}

      {reviewItem?.proposed && (
        <ReviewAnamnesisModal
          invitationId={reviewItem.id}
          kind="new"
          proposed={reviewItem.proposed}
          personal={reviewItem.personal}
          customAnswers={reviewItem.customAnswers}
          canEdit
          onClose={() => setReviewId(null)}
          onDone={(patientId) => {
            setReviewId(null);
            if (patientId) router.push(`/pacientes/${patientId}`);
            else router.refresh();
          }}
        />
      )}
    </div>
  );
}
