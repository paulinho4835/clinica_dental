"use client";

import { useActionState, useState, startTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  EMPTY_ANAMNESIS,
  ANTECEDENTES_FIELDS,
  HABITOS_FIELDS,
  type Anamnesis,
} from "@/lib/schemas/anamnesis";
import {
  EMPTY_INTAKE,
  REFERRAL_SOURCE_OPTIONS,
  type PatientIntake,
} from "@/lib/schemas/patient-intake";
import { FirmaField } from "@/components/patients/FirmaField";
import { submitPublicAnamnesis, type SubmitState } from "./submit-action";
import type { IntakeQuestion } from "@/lib/intakeQuestions";

const initial: SubmitState = {};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic";

export function PublicAnamnesisForm({
  token,
  kind = "existing",
  clinicName,
  patientName,
  initialData,
  initialAllergies,
  initialAlerts,
  customQuestions = [],
}: {
  token: string;
  kind?: "existing" | "new";
  clinicName: string;
  patientName: string;
  initialData: Anamnesis;
  initialAllergies: string;
  initialAlerts: string;
  customQuestions?: IntakeQuestion[];
}) {
  const isNew = kind === "new";
  const action = submitPublicAnamnesis.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);
  const [a, setA] = useState<Anamnesis>(initialData ?? EMPTY_ANAMNESIS);
  const [allergies, setAllergies] = useState(initialAllergies);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [person, setPerson] = useState<PatientIntake>({
    ...EMPTY_INTAKE,
    full_name: patientName,
  });
  const [custom, setCustom] = useState<Record<string, string | boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const setAntecedente = (key: string, val: boolean) =>
    setA((p) => ({ ...p, antecedentes: { ...p.antecedentes, [key]: val } }));
  const setHabito = (key: string, val: boolean) =>
    setA((p) => ({ ...p, habitos: { ...p.habitos, [key]: val } }));
  const setField = (k: keyof PatientIntake, v: string) =>
    setPerson((p) => ({ ...p, [k]: v }));

  function submit() {
    if (isNew && !person.full_name.trim()) {
      setLocalError("Por favor escriba su nombre completo.");
      return;
    }
    if (isNew) {
      const missing = customQuestions.find((q) => {
        if (!q.required) return false;
        const v = custom[q.key];
        return q.type === "boolean" ? v === undefined : !String(v ?? "").trim();
      });
      if (missing) {
        setLocalError(`Por favor responda: ${missing.label}`);
        return;
      }
    }
    setLocalError(null);
    const fd = new FormData();
    fd.append("anamnesis", JSON.stringify(a));
    fd.append("allergies", allergies);
    fd.append("medical_alerts", alerts);
    if (isNew) {
      fd.append("personal", JSON.stringify(person));
      fd.append("custom", JSON.stringify(custom));
    }
    startTransition(() => formAction(fd));
  }

  if (state.ok) {
    const first = (isNew ? person.full_name : patientName).split(" ")[0];
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800">
          ¡Gracias{first ? `, ${first}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isNew
            ? `Sus datos fueron enviados a ${clinicName}. Le confirmarán su registro. Ya puede cerrar esta página.`
            : `Su historial fue enviado a ${clinicName}. Ya puede cerrar esta página.`}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-clinic">{clinicName}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">
          {isNew ? "Registro de paciente" : "Historial clínico"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isNew
            ? "Bienvenido/a. Complete sus datos y su historial médico para agilizar su atención. Toda la información es confidencial."
            : `Hola ${patientName}, complete este breve formulario médico para su atención. Toda la información es confidencial.`}
        </p>
      </header>

      {/* Datos personales (solo en alta de paciente nuevo) */}
      {isNew && (
        <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Datos personales</h2>
          <label className="block text-sm text-slate-600">
            Nombre completo *
            <input
              className={inputClass}
              value={person.full_name}
              onChange={(e) => setField("full_name", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-600">
              C.I. / documento
              <input
                className={inputClass}
                value={person.national_id}
                onChange={(e) => setField("national_id", e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-600">
              Fecha de nacimiento
              <input
                type="date"
                className={inputClass}
                value={person.dob}
                onChange={(e) => setField("dob", e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-600">
              Sexo
              <select
                className={inputClass}
                value={person.sex}
                onChange={(e) => setField("sex", e.target.value)}
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
                value={person.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-600 sm:col-span-2">
              Correo electrónico
              <input
                type="email"
                className={inputClass}
                value={person.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </label>
            <label className="block text-sm text-slate-600 sm:col-span-2">
              Dirección
              <input
                className={inputClass}
                value={person.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="text-sm text-slate-600">¿Cómo nos conociste?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REFERRAL_SOURCE_OPTIONS.map((o) => {
                const checked = person.referral_source === o.value;
                return (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      checked
                        ? "border-clinic bg-clinic/5 text-slate-800"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="referral_source"
                      checked={checked}
                      onChange={() => setField("referral_source", o.value)}
                      className="h-4 w-4 border-slate-300 text-clinic focus:ring-clinic"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
            {person.referral_source === "otro" && (
              <input
                className={`${inputClass} mt-2`}
                placeholder="Cuéntanos dónde (opcional)"
                value={person.referral_source_other}
                onChange={(e) => setField("referral_source_other", e.target.value)}
              />
            )}
          </div>
        </section>
      )}

      {isNew && customQuestions.length > 0 && (
        <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-800">Preguntas de {clinicName}</h2>
          {customQuestions.map((q) => (
            <div key={q.key}>
              {q.type === "text" && (
                <label className="block text-sm text-slate-600">
                  {q.label}{q.required && " *"}
                  <input
                    className={inputClass}
                    value={typeof custom[q.key] === "string" ? (custom[q.key] as string) : ""}
                    onChange={(e) => setCustom((p) => ({ ...p, [q.key]: e.target.value }))}
                  />
                </label>
              )}
              {q.type === "boolean" && (
                <div>
                  <p className="text-sm text-slate-600">{q.label}{q.required && " *"}</p>
                  <div className="mt-2 flex gap-2">
                    {[["Sí", true], ["No", false]].map(([label, value]) => (
                      <label
                        key={label as string}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          custom[q.key] === value
                            ? "border-clinic bg-clinic/5 text-slate-800"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.key}
                          checked={custom[q.key] === value}
                          onChange={() => setCustom((p) => ({ ...p, [q.key]: value as boolean }))}
                          className="h-4 w-4 border-slate-300 text-clinic focus:ring-clinic"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {q.type === "select" && (
                <div>
                  <p className="text-sm text-slate-600">{q.label}{q.required && " *"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(q.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          custom[q.key] === opt
                            ? "border-clinic bg-clinic/5 text-slate-800"
                            : "border-slate-200 text-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.key}
                          checked={custom[q.key] === opt}
                          onChange={() => setCustom((p) => ({ ...p, [q.key]: opt }))}
                          className="h-4 w-4 border-slate-300 text-clinic focus:ring-clinic"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Antecedentes */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-800">
          ¿Tiene o ha tenido alguna de estas condiciones?
        </h2>
        <p className="mb-3 text-xs text-slate-400">Marque las que apliquen.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ANTECEDENTES_FIELDS.map((f) => {
            const checked = (a.antecedentes as unknown as Record<string, boolean>)[f.key];
            return (
              <label
                key={f.key}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  checked
                    ? "border-clinic bg-clinic/5 text-slate-800"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setAntecedente(f.key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
                />
                {f.label}
              </label>
            );
          })}
        </div>
        <label className="mt-3 block text-sm text-slate-600">
          Otras condiciones (opcional)
          <input
            className={inputClass}
            value={a.antecedentes.otros}
            onChange={(e) =>
              setA((p) => ({
                ...p,
                antecedentes: { ...p.antecedentes, otros: e.target.value },
              }))
            }
          />
        </label>
      </section>

      {/* Hábitos */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Hábitos</h2>
        <div className="flex flex-wrap gap-2">
          {HABITOS_FIELDS.map((f) => {
            const checked = (a.habitos as unknown as Record<string, boolean>)[f.key];
            return (
              <label
                key={f.key}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  checked
                    ? "border-clinic bg-clinic/5 text-slate-800"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setHabito(f.key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
                />
                {f.label}
              </label>
            );
          })}
        </div>
        {(a.habitos as unknown as Record<string, boolean>).otros && (
          <label className="mt-3 block text-sm text-slate-600">
            Especificar otros hábitos
            <input
              className={inputClass}
              value={a.habitos.otros_detalle}
              onChange={(e) =>
                setA((p) => ({
                  ...p,
                  habitos: { ...p.habitos, otros_detalle: e.target.value },
                }))
              }
            />
          </label>
        )}
      </section>

      {/* Alergias y medicación */}
      <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block text-sm text-slate-600">
          Alergias (medicamentos, materiales, alimentos…)
          <input
            className={inputClass}
            placeholder="Separe con comas. Ej: penicilina, látex"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-600">
          Alertas médicas importantes
          <input
            className={inputClass}
            placeholder="Separe con comas. Ej: marcapasos, embarazo de riesgo"
            value={alerts}
            onChange={(e) => setAlerts(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-600">
          ¿Toma algún medicamento de forma habitual?
          <input
            className={inputClass}
            value={a.medicacion_habitual}
            onChange={(e) =>
              setA((p) => ({ ...p, medicacion_habitual: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm text-slate-600">
          Embarazo / lactancia
          <select
            className={inputClass}
            value={a.embarazo}
            onChange={(e) =>
              setA((p) => ({
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
      </section>

      {/* Otros datos */}
      <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block text-sm text-slate-600">
          Antecedentes familiares relevantes
          <input
            className={inputClass}
            value={a.antecedentes_familiares}
            onChange={(e) =>
              setA((p) => ({ ...p, antecedentes_familiares: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm text-slate-600">
          Motivo de su consulta
          <input
            className={inputClass}
            value={a.motivo_consulta}
            onChange={(e) =>
              setA((p) => ({ ...p, motivo_consulta: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm text-slate-600">
          ¿Cuándo fue su última visita al odontólogo?
          <input
            className={inputClass}
            value={a.ultima_visita_odontologica}
            onChange={(e) =>
              setA((p) => ({
                ...p,
                ultima_visita_odontologica: e.target.value,
              }))
            }
          />
        </label>
        <label className="block text-sm text-slate-600">
          ¿Y por qué?
          <input
            className={inputClass}
            value={a.ultima_visita_motivo}
            onChange={(e) =>
              setA((p) => ({
                ...p,
                ultima_visita_motivo: e.target.value,
              }))
            }
          />
        </label>
      </section>

      {/* Firma digital (opcional) */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Firma (opcional)</h2>
        <p className="mb-3 text-xs text-slate-400">
          Si lo desea, firme con el dedo o el mouse para dejar constancia.
        </p>
        <FirmaField
          value={a.firma}
          onChange={(v) => setA((p) => ({ ...p, firma: v }))}
        />
      </section>

      <p className="mb-4 text-xs leading-relaxed text-slate-400">
        Declaro que la información proporcionada es verídica y completa. Autorizo
        a {clinicName} a utilizar estos datos con fines exclusivamente clínicos y
        odontológicos.
      </p>

      {(state.error || localError) && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {localError ?? state.error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-clinic px-4 py-3 text-sm font-semibold text-white hover:bg-clinic-fg disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar mi historial"}
      </button>
    </div>
  );
}
