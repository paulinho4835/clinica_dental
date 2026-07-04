"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import {
  ANTECEDENTES_FIELDS,
  HABITOS_FIELDS,
  type Anamnesis,
} from "@/lib/schemas/anamnesis";
import type { PatientIntake } from "@/lib/schemas/patient-intake";
import {
  applyAnamnesisInvitation,
  discardAnamnesisInvitation,
} from "@/app/(dashboard)/pacientes/anamnesis-invitation-actions";

const EMBARAZO_LABEL: Record<string, string> = {
  no_aplica: "No aplica",
  embarazada: "Embarazada",
  lactancia: "En lactancia",
};

export function ReviewAnamnesisModal({
  invitationId,
  kind = "existing",
  proposed,
  personal,
  currentAllergies = [],
  currentAlerts = [],
  onClose,
  onDone,
}: {
  invitationId: string;
  kind?: "existing" | "new";
  proposed: { data: Anamnesis; allergies: string[]; alerts: string[] };
  personal?: PatientIntake | null;
  currentAllergies?: string[];
  currentAlerts?: string[];
  onClose: () => void;
  onDone: (patientId?: string) => void;
}) {
  useDismissable(onClose);
  const [busy, setBusy] = useState(false);
  const isNew = kind === "new";

  const a = proposed.data;
  const activos = ANTECEDENTES_FIELDS.filter(
    (f) => (a.antecedentes as unknown as Record<string, boolean>)[f.key],
  );
  const habitos = HABITOS_FIELDS.filter(
    (f) => (a.habitos as unknown as Record<string, boolean>)[f.key],
  );

  async function apply() {
    setBusy(true);
    const res = await applyAnamnesisInvitation(invitationId);
    setBusy(false);
    if (res.ok) {
      toast(isNew ? "Paciente creado" : "Historial aplicado al expediente", "success");
      onDone(res.patientId);
    } else {
      toast(res.error ?? "No se pudo aplicar", "error");
    }
  }

  async function discard() {
    setBusy(true);
    const res = await discardAnamnesisInvitation(invitationId);
    setBusy(false);
    if (res.ok) {
      toast("Propuesta descartada", "success");
      onDone();
    } else {
      toast(res.error ?? "No se pudo descartar", "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">
              {isNew ? "Revisar registro del paciente" : "Revisar historial del paciente"}
            </h2>
            <p className="text-xs text-slate-500">
              {isNew
                ? "Crea el paciente con estos datos o descarta la solicitud."
                : "Aplica al expediente o descarta. El expediente actual no cambia hasta que apliques."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {isNew && personal && (
            <dl className="mb-4 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Datos personales
              </p>
              <Row label="Nombre completo">{personal.full_name || "—"}</Row>
              <Row label="C.I. / documento">{personal.national_id || "—"}</Row>
              <Row label="Fecha de nacimiento">{personal.dob || "—"}</Row>
              <Row label="Sexo">{personal.sex || "—"}</Row>
              <Row label="Teléfono">{personal.phone || "—"}</Row>
              <Row label="Correo">{personal.email || "—"}</Row>
              <Row label="Dirección">{personal.address || "—"}</Row>
            </dl>
          )}
          <dl className="space-y-3 text-sm">
            <Row label="Condiciones">
              {activos.length ? activos.map((f) => f.label).join(", ") : "Ninguna"}
            </Row>
            <Row label="Hábitos">
              {habitos.length ? habitos.map((f) => f.label).join(", ") : "Ninguno"}
            </Row>
            {a.antecedentes.otros && (
              <Row label="Otros antecedentes">{a.antecedentes.otros}</Row>
            )}
            {a.habitos.otros_detalle && (
              <Row label="Otros hábitos">{a.habitos.otros_detalle}</Row>
            )}
            <Row label="Medicación habitual">{a.medicacion_habitual || "Ninguna"}</Row>
            <Row label="Embarazo / lactancia">{EMBARAZO_LABEL[a.embarazo]}</Row>
            <Row label="Antecedentes familiares">
              {a.antecedentes_familiares || "—"}
            </Row>
            <Row label="Motivo de consulta">{a.motivo_consulta || "—"}</Row>
            <Row label="Última visita odontológica">
              {a.ultima_visita_odontologica || "—"}
            </Row>
            {a.ultima_visita_motivo && (
              <Row label="Motivo de la última visita">{a.ultima_visita_motivo}</Row>
            )}
            <Row label="Alergias">
              {isNew ? (
                proposed.allergies.length ? proposed.allergies.join(", ") : "—"
              ) : (
                <Diff current={currentAllergies} next={proposed.allergies} />
              )}
            </Row>
            <Row label="Alertas médicas">
              {isNew ? (
                proposed.alerts.length ? proposed.alerts.join(", ") : "—"
              ) : (
                <Diff current={currentAlerts} next={proposed.alerts} />
              )}
            </Row>
          </dl>

          {a.firma && (
            <div className="mt-3">
              <p className="text-xs text-slate-500">Firma del paciente</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.firma}
                alt="Firma del paciente"
                className="mt-1 h-24 rounded-lg border border-slate-200 bg-white object-contain"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
          <Button type="button" onClick={apply} disabled={busy}>
            {busy
              ? isNew
                ? "Creando…"
                : "Aplicando…"
              : isNew
                ? "Crear paciente"
                : "Aplicar al expediente"}
          </Button>
          <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
            Descartar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

// Muestra el valor propuesto; si difiere del actual, lo nota.
function Diff({ current, next }: { current: string[]; next: string[] }) {
  const nextStr = next.length ? next.join(", ") : "—";
  const same =
    current.length === next.length &&
    current.every((v, i) => v === next[i]);
  return (
    <span>
      {nextStr}
      {!same && (
        <span className="ml-1 text-xs text-amber-600">
          (actual: {current.length ? current.join(", ") : "—"})
        </span>
      )}
    </span>
  );
}
