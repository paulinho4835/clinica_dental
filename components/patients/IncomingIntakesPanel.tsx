"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NewPatientInviteModal } from "@/components/patients/NewPatientInviteModal";
import { ReviewAnamnesisModal } from "@/components/patients/ReviewAnamnesisModal";
import type { Anamnesis } from "@/lib/schemas/anamnesis";
import type { PatientIntake } from "@/lib/schemas/patient-intake";

export type IntakeItem = {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  completedAt: string | null;
  personal: PatientIntake | null;
  proposed: { data: Anamnesis; allergies: string[]; alerts: string[] } | null;
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

  const reviewItem = ready.find((r) => r.id === reviewId) ?? null;

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
                <p className="truncate text-sm font-medium text-slate-800">
                  {r.personal?.full_name || r.contactName || "Paciente nuevo"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {r.personal?.national_id ? `CI: ${r.personal.national_id} · ` : ""}
                  {r.contactPhone ?? r.personal?.phone ?? "Sin teléfono"}
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
        <p className="mt-3 text-xs text-slate-400">
          {awaiting.length} enlace{awaiting.length !== 1 ? "s" : ""} enviado
          {awaiting.length !== 1 ? "s" : ""} esperando que el paciente complete.
        </p>
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
