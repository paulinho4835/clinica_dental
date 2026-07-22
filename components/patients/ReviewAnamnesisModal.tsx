"use client";

import { useState } from "react";
import { X, Pencil } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import {
  ANTECEDENTES_FIELDS,
  HABITOS_FIELDS,
  type Anamnesis,
} from "@/lib/schemas/anamnesis";
import {
  EMPTY_INTAKE,
  REFERRAL_SOURCE_LABEL,
  REFERRAL_SOURCE_OPTIONS,
  type PatientIntake,
} from "@/lib/schemas/patient-intake";
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";
import {
  applyAnamnesisInvitation,
  discardAnamnesisInvitation,
  updateIntakeProposal,
} from "@/app/(dashboard)/pacientes/anamnesis-invitation-actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic";

const joinList = (v: string[]) => v.join(", ");
const splitList = (v: string) =>
  v.split(",").map((s) => s.trim()).filter(Boolean);

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
  customAnswers = [],
  currentAllergies = [],
  currentAlerts = [],
  canEdit = false,
  onClose,
  onDone,
}: {
  invitationId: string;
  kind?: "existing" | "new";
  proposed: { data: Anamnesis; allergies: string[]; alerts: string[] };
  personal?: PatientIntake | null;
  customAnswers?: IntakeAnswerSnapshot[];
  currentAllergies?: string[];
  currentAlerts?: string[];
  /** Permite corregir los datos antes de aprobar (admin, recepción, colega). */
  canEdit?: boolean;
  onClose: () => void;
  onDone: (patientId?: string) => void;
}) {
  useDismissable(onClose);
  const [busy, setBusy] = useState(false);
  const isNew = kind === "new";

  const [editing, setEditing] = useState(false);
  const [viewData, setViewData] = useState(proposed);
  const [viewPersonal, setViewPersonal] = useState(personal ?? null);
  const [draftPerson, setDraftPerson] = useState<PatientIntake>(
    personal ?? EMPTY_INTAKE,
  );
  const [draftData, setDraftData] = useState<Anamnesis>(proposed.data);
  const [draftAllergies, setDraftAllergies] = useState(joinList(proposed.allergies));
  const [draftAlerts, setDraftAlerts] = useState(joinList(proposed.alerts));

  const a = viewData.data;
  const activos = ANTECEDENTES_FIELDS.filter(
    (f) => (a.antecedentes as unknown as Record<string, boolean>)[f.key],
  );
  const habitos = HABITOS_FIELDS.filter(
    (f) => (a.habitos as unknown as Record<string, boolean>)[f.key],
  );

  const setAntecedente = (key: string, val: boolean) =>
    setDraftData((p) => ({ ...p, antecedentes: { ...p.antecedentes, [key]: val } }));
  const setHabito = (key: string, val: boolean) =>
    setDraftData((p) => ({ ...p, habitos: { ...p.habitos, [key]: val } }));
  const setPersonField = (k: keyof PatientIntake, v: string) =>
    setDraftPerson((p) => ({ ...p, [k]: v }));

  function startEdit() {
    setDraftPerson(viewPersonal ?? EMPTY_INTAKE);
    setDraftData(viewData.data);
    setDraftAllergies(joinList(viewData.allergies));
    setDraftAlerts(joinList(viewData.alerts));
    setEditing(true);
  }

  async function saveEdit() {
    if (isNew && !draftPerson.full_name.trim()) {
      toast("El nombre completo es obligatorio.", "error");
      return;
    }
    setBusy(true);
    const res = await updateIntakeProposal(invitationId, {
      personal: draftPerson,
      data: draftData,
      allergies: splitList(draftAllergies),
      alerts: splitList(draftAlerts),
    });
    setBusy(false);
    if (res.ok) {
      toast("Registro actualizado", "success");
      setViewPersonal(draftPerson);
      setViewData({
        data: draftData,
        allergies: splitList(draftAllergies),
        alerts: splitList(draftAlerts),
      });
      setEditing(false);
    } else {
      toast(res.error ?? "No se pudo guardar", "error");
    }
  }

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
              {editing
                ? "Editar registro del paciente"
                : isNew
                  ? "Revisar registro del paciente"
                  : "Revisar historial del paciente"}
            </h2>
            <p className="text-xs text-slate-500">
              {editing
                ? "Corrige los datos (ej. errores del Asistente Virtual) y guarda."
                : isNew
                  ? "Crea el paciente con estos datos o descarta la solicitud."
                  : "Aplica al expediente o descarta. El expediente actual no cambia hasta que apliques."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isNew && canEdit && !editing && (
              <button
                type="button"
                onClick={startEdit}
                title="Editar antes de aprobar"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-clinic"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="overflow-y-auto px-5 py-4">
            <div className="mb-5 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Datos personales
              </p>
              <label className="block text-sm text-slate-600">
                Nombre completo *
                <input
                  className={inputClass}
                  value={draftPerson.full_name}
                  onChange={(e) => setPersonField("full_name", e.target.value)}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-600">
                  C.I. / documento
                  <input
                    className={inputClass}
                    value={draftPerson.national_id}
                    onChange={(e) => setPersonField("national_id", e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Fecha de nacimiento
                  <input
                    type="date"
                    className={inputClass}
                    value={draftPerson.dob}
                    onChange={(e) => setPersonField("dob", e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-600">
                  Sexo
                  <select
                    className={inputClass}
                    value={draftPerson.sex}
                    onChange={(e) => setPersonField("sex", e.target.value)}
                  >
                    <option value="">Prefiero no decir</option>
                    <option value="F">Femenino</option>
                    <option value="M">Masculino</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-600">
                  Teléfono
                  <input
                    className={inputClass}
                    value={draftPerson.phone}
                    onChange={(e) => setPersonField("phone", e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-600 sm:col-span-2">
                  Correo
                  <input
                    type="email"
                    className={inputClass}
                    value={draftPerson.email}
                    onChange={(e) => setPersonField("email", e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-600 sm:col-span-2">
                  Dirección
                  <input
                    className={inputClass}
                    value={draftPerson.address}
                    onChange={(e) => setPersonField("address", e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm text-slate-600">
                ¿Cómo nos conoció?
                <select
                  className={inputClass}
                  value={draftPerson.referral_source}
                  onChange={(e) => setPersonField("referral_source", e.target.value)}
                >
                  <option value="">—</option>
                  {REFERRAL_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {draftPerson.referral_source === "otro" && (
                <label className="block text-sm text-slate-600">
                  Especificar
                  <input
                    className={inputClass}
                    value={draftPerson.referral_source_other}
                    onChange={(e) =>
                      setPersonField("referral_source_other", e.target.value)
                    }
                  />
                </label>
              )}
            </div>

            <div className="mb-5 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Antecedentes
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ANTECEDENTES_FIELDS.map((f) => {
                  const checked = (
                    draftData.antecedentes as unknown as Record<string, boolean>
                  )[f.key];
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        checked
                          ? "border-clinic bg-clinic/5 text-slate-800"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setAntecedente(f.key, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-clinic focus:ring-clinic"
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
              <label className="block text-sm text-slate-600">
                Otras condiciones
                <input
                  className={inputClass}
                  value={draftData.antecedentes.otros}
                  onChange={(e) =>
                    setDraftData((p) => ({
                      ...p,
                      antecedentes: { ...p.antecedentes, otros: e.target.value },
                    }))
                  }
                />
              </label>
            </div>

            <div className="mb-5 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-400">Hábitos</p>
              <div className="flex flex-wrap gap-2">
                {HABITOS_FIELDS.map((f) => {
                  const checked = (
                    draftData.habitos as unknown as Record<string, boolean>
                  )[f.key];
                  return (
                    <label
                      key={f.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        checked
                          ? "border-clinic bg-clinic/5 text-slate-800"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setHabito(f.key, e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-clinic focus:ring-clinic"
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
              <label className="block text-sm text-slate-600">
                Especificar otros hábitos
                <input
                  className={inputClass}
                  value={draftData.habitos.otros_detalle}
                  onChange={(e) =>
                    setDraftData((p) => ({
                      ...p,
                      habitos: { ...p.habitos, otros_detalle: e.target.value },
                    }))
                  }
                />
              </label>
            </div>

            <div className="mb-5 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Alergias, alertas y otros datos
              </p>
              <label className="block text-sm text-slate-600">
                Alergias
                <input
                  className={inputClass}
                  placeholder="Separe con comas. Ej: penicilina, látex"
                  value={draftAllergies}
                  onChange={(e) => setDraftAllergies(e.target.value)}
                />
              </label>
              <label className="block text-sm text-slate-600">
                Alertas médicas
                <input
                  className={inputClass}
                  placeholder="Separe con comas. Ej: marcapasos, embarazo de riesgo"
                  value={draftAlerts}
                  onChange={(e) => setDraftAlerts(e.target.value)}
                />
              </label>
              <label className="block text-sm text-slate-600">
                Medicación habitual
                <input
                  className={inputClass}
                  value={draftData.medicacion_habitual}
                  onChange={(e) =>
                    setDraftData((p) => ({ ...p, medicacion_habitual: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-600">
                Embarazo / lactancia
                <select
                  className={inputClass}
                  value={draftData.embarazo}
                  onChange={(e) =>
                    setDraftData((p) => ({
                      ...p,
                      embarazo: e.target.value as Anamnesis["embarazo"],
                    }))
                  }
                >
                  <option value="no_aplica">No aplica</option>
                  <option value="embarazada">Embarazada</option>
                  <option value="lactancia">En lactancia</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                Antecedentes familiares
                <input
                  className={inputClass}
                  value={draftData.antecedentes_familiares}
                  onChange={(e) =>
                    setDraftData((p) => ({ ...p, antecedentes_familiares: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-600">
                Motivo de consulta
                <input
                  className={inputClass}
                  value={draftData.motivo_consulta}
                  onChange={(e) =>
                    setDraftData((p) => ({ ...p, motivo_consulta: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-600">
                Última visita odontológica
                <input
                  className={inputClass}
                  value={draftData.ultima_visita_odontologica}
                  onChange={(e) =>
                    setDraftData((p) => ({
                      ...p,
                      ultima_visita_odontologica: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-slate-600">
                Motivo de la última visita
                <input
                  className={inputClass}
                  value={draftData.ultima_visita_motivo}
                  onChange={(e) =>
                    setDraftData((p) => ({ ...p, ultima_visita_motivo: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto px-5 py-4">
            {isNew && viewPersonal && (
              <dl className="mb-4 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Datos personales
                </p>
                <Row label="Nombre completo">{viewPersonal.full_name || "—"}</Row>
                <Row label="C.I. / documento">{viewPersonal.national_id || "—"}</Row>
                <Row label="Fecha de nacimiento">{viewPersonal.dob || "—"}</Row>
                <Row label="Sexo">{viewPersonal.sex || "—"}</Row>
                <Row label="Teléfono">{viewPersonal.phone || "—"}</Row>
                <Row label="Correo">{viewPersonal.email || "—"}</Row>
                <Row label="Dirección">{viewPersonal.address || "—"}</Row>
                <Row label="¿Cómo nos conoció?">
                  {viewPersonal.referral_source
                    ? REFERRAL_SOURCE_LABEL[viewPersonal.referral_source] ??
                      viewPersonal.referral_source
                    : "—"}
                  {viewPersonal.referral_source === "otro" &&
                    viewPersonal.referral_source_other &&
                    ` — ${viewPersonal.referral_source_other}`}
                </Row>
              </dl>
            )}
            {isNew && customAnswers.length > 0 && (
              <dl className="mb-4 space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Preguntas adicionales
                </p>
                {customAnswers.map((c) => (
                  <Row key={c.key} label={c.label}>
                    {typeof c.value === "boolean" ? (c.value ? "Sí" : "No") : c.value}
                  </Row>
                ))}
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
                  viewData.allergies.length ? viewData.allergies.join(", ") : "—"
                ) : (
                  <Diff current={currentAllergies} next={viewData.allergies} />
                )}
              </Row>
              <Row label="Alertas médicas">
                {isNew ? (
                  viewData.alerts.length ? viewData.alerts.join(", ") : "—"
                ) : (
                  <Diff current={currentAlerts} next={viewData.alerts} />
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
        )}

        <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
          {editing ? (
            <>
              <Button type="button" onClick={saveEdit} disabled={busy}>
                {busy ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
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
