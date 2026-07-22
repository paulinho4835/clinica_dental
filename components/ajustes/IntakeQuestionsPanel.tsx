"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { saveIntakeQuestions } from "@/app/(dashboard)/ajustes/actions";
import { slugifyQuestionKey, type IntakeQuestion, type IntakeQuestionType } from "@/lib/intakeQuestions";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:opacity-50";

const TYPE_LABEL: Record<IntakeQuestionType, string> = {
  text: "Texto libre",
  boolean: "Sí / No",
  select: "Opción única",
};

// `isNew` es un flag interno del componente (nunca se persiste): marca si la
// pregunta todavía no fue guardada, que es el único momento en que el key
// puede derivarse del label. Una vez guardada, el key queda fijo para
// siempre aunque el label cambie, porque respuestas de pacientes ya
// existentes están atadas a ese key.
type DraftQuestion = IntakeQuestion & { isNew: boolean };

function optionsToText(options?: string[]) {
  return (options ?? []).join(", ");
}

function textToOptions(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

export function IntakeQuestionsPanel({
  initialQuestions,
  canWrite,
}: {
  initialQuestions: IntakeQuestion[];
  canWrite: boolean;
}) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initialQuestions.map((q) => ({ ...q, isNew: false })),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addQuestion() {
    const key = slugifyQuestionKey("pregunta", questions.map((q) => q.key));
    setQuestions((prev) => [
      ...prev,
      { key, label: "", type: "text", required: false, active: true, position: prev.length, isNew: true },
    ]);
    setSaved(false);
  }

  function updateQuestion(index: number, patch: Partial<IntakeQuestion>) {
    setQuestions((prev) => {
      const next = [...prev];
      const current = next[index];
      const updated = { ...current, ...patch };
      // El key solo se deriva del label mientras la pregunta sea nueva y
      // nunca se haya guardado (flag `isNew`, no un match de texto sobre el
      // key). Una vez guardada, el key queda fijo para siempre aunque el
      // label cambie, porque respuestas de pacientes ya existentes están
      // atadas a ese key.
      if (patch.label !== undefined && current.isNew === true) {
        updated.key = slugifyQuestionKey(patch.label || "pregunta", next.filter((_, i) => i !== index).map((q) => q.key));
      }
      next[index] = updated;
      return next;
    });
    setSaved(false);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, position: i })));
    setSaved(false);
  }

  function move(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((q, i) => ({ ...q, position: i }));
    });
    setSaved(false);
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const payload: IntakeQuestion[] = questions.map(({ isNew: _isNew, ...q }) => q);
    const res = await saveIntakeQuestions(payload);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Una vez persistida, ninguna pregunta debe volver a regenerar su key,
    // ni siquiera dentro de la misma sesión sin recargar la página.
    setQuestions((prev) => prev.map((q) => ({ ...q, isNew: false })));
    setSaved(true);
  }

  return (
    <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {questions.length === 0 && (
        <p className="text-sm text-slate-400">
          Sin preguntas adicionales todavía. Se agregan al final del formulario de alta.
        </p>
      )}

      {questions.map((q, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-2">
            <input
              className={`${inputClass} flex-1`}
              placeholder="Texto de la pregunta"
              value={q.label}
              disabled={!canWrite}
              onChange={(e) => updateQuestion(index, { label: e.target.value })}
            />
            <select
              className={inputClass}
              value={q.type}
              disabled={!canWrite}
              onChange={(e) => updateQuestion(index, { type: e.target.value as IntakeQuestionType })}
            >
              {(Object.keys(TYPE_LABEL) as IntakeQuestionType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
            {canWrite && (
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => move(index, -1)} title="Subir" className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => move(index, 1)} title="Bajar" className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeQuestion(index)} title="Eliminar pregunta" aria-label="Eliminar pregunta" className="rounded p-1.5 text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {q.type === "select" && (
            <input
              className={inputClass}
              placeholder="Opciones separadas por coma (2 a 8)"
              value={optionsToText(q.options)}
              disabled={!canWrite}
              onChange={(e) => updateQuestion(index, { options: textToOptions(e.target.value) })}
            />
          )}

          <div className="flex items-center gap-4 text-sm text-slate-600">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={q.required}
                disabled={!canWrite}
                onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              Obligatoria
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={q.active}
                disabled={!canWrite}
                onChange={(e) => updateQuestion(index, { active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              Activa
            </label>
          </div>
        </div>
      ))}

      {canWrite && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Agregar pregunta
          </button>
          <div className="flex items-center gap-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && !error && <p className="text-sm text-emerald-600">Configuración guardada.</p>}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
