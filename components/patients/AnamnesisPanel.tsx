"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, ChevronDown } from "lucide-react";
import {
  updateAnamnesis,
  type ActionState,
} from "@/app/(dashboard)/pacientes/anamnesis-actions";
import {
  parseAnamnesis,
  ANTECEDENTES_FIELDS,
  HABITOS_FIELDS,
  type Anamnesis,
} from "@/lib/schemas/anamnesis";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { toast } from "@/lib/toast";

const initial: ActionState = {};

const EMBARAZO_LABEL: Record<Anamnesis["embarazo"], string> = {
  no_aplica: "No aplica",
  embarazada: "Embarazada",
  lactancia: "Lactancia",
};

function fmt(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnamnesisPanel({
  patientId,
  anamnesis,
  allergies,
  medicalAlerts,
  legacyAnamnesis,
  canEdit,
}: {
  patientId: string;
  anamnesis: Anamnesis;
  allergies: string[];
  medicalAlerts: string[];
  legacyAnamnesis: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const a = parseAnamnesis(anamnesis);

  const activos = ANTECEDENTES_FIELDS.filter(
    (f) => (a.antecedentes as unknown as Record<string, boolean>)[f.key],
  );
  const habitos = HABITOS_FIELDS.filter(
    (f) => (a.habitos as Record<string, boolean>)[f.key],
  );

  if (editing) {
    return (
      <AnamnesisForm
        patientId={patientId}
        anamnesis={a}
        allergies={allergies}
        medicalAlerts={medicalAlerts}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-slate-800">Antecedentes médicos</h3>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Editar antecedentes
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Row label="Condiciones">
          {activos.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {activos.map((f) => (
                <span
                  key={f.key}
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                >
                  {f.label}
                </span>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="Hábitos">
          {habitos.length > 0 ? (
            <span className="text-slate-700">{habitos.map((h) => h.label).join(", ")}</span>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="Medicación habitual">
          {a.medicacion_habitual ? (
            <span className="text-slate-700">{a.medicacion_habitual}</span>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="Embarazo / lactancia">
          <span className="text-slate-700">{EMBARAZO_LABEL[a.embarazo]}</span>
        </Row>
        <Row label="Antecedentes familiares">
          {a.antecedentes_familiares ? (
            <span className="text-slate-700">{a.antecedentes_familiares}</span>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="Motivo de consulta">
          {a.motivo_consulta ? (
            <span className="text-slate-700">{a.motivo_consulta}</span>
          ) : (
            <Empty />
          )}
        </Row>
        {a.antecedentes.otros && (
          <Row label="Otros antecedentes">
            <span className="text-slate-700">{a.antecedentes.otros}</span>
          </Row>
        )}
        {a.ultima_visita_odontologica && (
          <Row label="Última visita odontológica">
            <span className="text-slate-700">{a.ultima_visita_odontologica}</span>
          </Row>
        )}
      </dl>

      {a.actualizado_en && (
        <p className="mt-3 text-xs text-slate-400">
          Actualizado por {a.actualizado_por || "—"} · {fmt(a.actualizado_en)}
        </p>
      )}

      {legacyAnamnesis && legacyAnamnesis.trim() && (
        <div className="mt-3 rounded-lg ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Lock className="h-3 w-3" />
              Anamnesis histórica (sin estructurar)
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${showLegacy ? "rotate-180" : ""}`}
            />
          </button>
          {showLegacy && (
            <p className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-600">
              {legacyAnamnesis}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="text-slate-400">—</span>;
}

function AnamnesisForm({
  patientId,
  anamnesis,
  allergies,
  medicalAlerts,
  onDone,
  onCancel,
}: {
  patientId: string;
  anamnesis: Anamnesis;
  allergies: string[];
  medicalAlerts: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const boundAction = updateAnamnesis.bind(null, patientId);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  const [a, setA] = useState<Anamnesis>(anamnesis);
  const [allergiesStr, setAllergiesStr] = useState(allergies.join(", "));
  const [alertsStr, setAlertsStr] = useState(medicalAlerts.join(", "));

  useEffect(() => {
    if (state.ok) {
      toast("Antecedentes guardados", "success");
      onDone();
    } else if (state.error) {
      toast(state.error, "error");
    }
  }, [state, onDone]);

  function submit() {
    const fd = new FormData();
    fd.append("anamnesis", JSON.stringify(a));
    fd.append("allergies", allergiesStr);
    fd.append("medical_alerts", alertsStr);
    startTransition(() => formAction(fd));
  }

  const setAntecedente = (key: string, val: boolean) =>
    setA((p) => ({ ...p, antecedentes: { ...p.antecedentes, [key]: val } }));
  const setHabito = (key: string, val: boolean) =>
    setA((p) => ({ ...p, habitos: { ...p.habitos, [key]: val } }));

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-800">Editar antecedentes médicos</h3>

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-medium uppercase text-slate-400">
          Antecedentes patológicos
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ANTECEDENTES_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={(a.antecedentes as unknown as Record<string, boolean>)[f.key]}
                onChange={(e) => setAntecedente(f.key, e.target.checked)}
                className="rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              {f.label}
            </label>
          ))}
        </div>
        <label className="mt-2 block text-sm">
          <FieldLabel>Otros antecedentes</FieldLabel>
          <input
            className={fieldInputClass}
            value={a.antecedentes.otros}
            onChange={(e) =>
              setA((p) => ({ ...p, antecedentes: { ...p.antecedentes, otros: e.target.value } }))
            }
          />
        </label>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-xs font-medium uppercase text-slate-400">Hábitos</legend>
        <div className="flex flex-wrap gap-4">
          {HABITOS_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={(a.habitos as Record<string, boolean>)[f.key]}
                onChange={(e) => setHabito(f.key, e.target.checked)}
                className="rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <FieldLabel>Medicación habitual</FieldLabel>
          <input
            className={fieldInputClass}
            value={a.medicacion_habitual}
            onChange={(e) => setA((p) => ({ ...p, medicacion_habitual: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <FieldLabel>Embarazo / lactancia</FieldLabel>
          <select
            className={fieldInputClass}
            value={a.embarazo}
            onChange={(e) =>
              setA((p) => ({ ...p, embarazo: e.target.value as Anamnesis["embarazo"] }))
            }
          >
            <option value="no_aplica">No aplica</option>
            <option value="embarazada">Embarazada</option>
            <option value="lactancia">Lactancia</option>
          </select>
        </label>
        <label className="block text-sm">
          <FieldLabel>Antecedentes familiares</FieldLabel>
          <input
            className={fieldInputClass}
            value={a.antecedentes_familiares}
            onChange={(e) => setA((p) => ({ ...p, antecedentes_familiares: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <FieldLabel>Última visita odontológica</FieldLabel>
          <input
            className={fieldInputClass}
            value={a.ultima_visita_odontologica}
            onChange={(e) => setA((p) => ({ ...p, ultima_visita_odontologica: e.target.value }))}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <FieldLabel>Motivo de consulta</FieldLabel>
          <input
            className={fieldInputClass}
            value={a.motivo_consulta}
            onChange={(e) => setA((p) => ({ ...p, motivo_consulta: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <FieldLabel>Alergias (separadas por coma)</FieldLabel>
          <input
            className={fieldInputClass}
            value={allergiesStr}
            onChange={(e) => setAllergiesStr(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <FieldLabel>Alertas médicas (coma)</FieldLabel>
          <input
            className={fieldInputClass}
            value={alertsStr}
            onChange={(e) => setAlertsStr(e.target.value)}
          />
        </label>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Guardando…" : "Guardar antecedentes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
