import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";

export function CustomIntakeAnswers({ answers }: { answers: IntakeAnswerSnapshot[] }) {
  if (!answers.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Preguntas adicionales</h2>
      <dl className="space-y-2 rounded-lg bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
        {answers.map((a) => (
          <div key={a.key}>
            <dt className="text-xs text-slate-500">{a.label}</dt>
            <dd className="mt-0.5 text-slate-700">
              {typeof a.value === "boolean" ? (a.value ? "Sí" : "No") : a.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
