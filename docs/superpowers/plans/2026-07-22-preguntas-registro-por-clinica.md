# Preguntas adicionales de registro por clínica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each clinic define its own extra questions (text / boolean / single-select) appended to the public new-patient registration form (`/h/[token]`, `kind: "new"`), and show the answers back on the patient file — without touching the fixed clinical anamnesis fields.

**Architecture:** Question config lives in `clinics.settings.custom_intake_questions` (jsonb, no new table — same pattern as `clinical_hours`). Answers are snapshotted (`{key, label, type, value}`) into two new columns — `anamnesis_invitations.submitted_custom` (proposal) and `patients.custom_intake_answers` (applied) — so editing/removing a question later never breaks an already-saved answer. A pure domain module (`lib/intakeQuestions.ts`) owns all validation and snapshot logic; UI and server actions call into it.

**Tech Stack:** Next.js App Router server actions, Supabase (Postgres jsonb columns), Zod, Vitest + Testing Library.

## Global Constraints

- Fixed clinical anamnesis fields (`lib/schemas/anamnesis.ts`) are NOT editable or hideable by clinics in this phase.
- Custom questions appear ONLY on the new-patient intake form (`kind: "new"`), never on the existing-patient historial form (`kind: "existing"`).
- Exactly 3 question types: `"text"`, `"boolean"`, `"select"`. No date, number, multi-select, or file types.
- Max 10 active questions per clinic (enforced server-side when saving config).
- `select` questions require 2–8 non-empty, non-duplicate options.
- Answers are stored as snapshots (`{key, label, type, value}`), never as a bare `key: value` map — the `label` at answer-time must survive later edits to the question config.
- Feature-gated behind a new opt-in addon `preguntas_registro` (off by default), following the existing single-plan + manual-addon business model.
- Only `admin` configures questions (same permission as the rest of Ajustes: `can(role, "settings:write")`, gated additionally by `role === "admin"` for the write action itself, matching `assertClinicAdmin()`).
- Spanish neutral in all UI copy (no voseo).
- Migration number: use `0097_intake_custom_answers.sql`. Before running Task 2, check `ls supabase/migrations | sort | tail -3` — if `0097` is already taken (e.g. by the unmerged `consultorio-compartido-colegas` branch landing first), use the next free number instead and update every reference to the filename in this plan.

---

### Task 1: Domain module — question config, validation, and answer snapshots

**Files:**
- Create: `lib/intakeQuestions.ts`
- Test: `tests/intakeQuestions.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - `type IntakeQuestionType = "text" | "boolean" | "select"`
  - `interface IntakeQuestion { key: string; label: string; type: IntakeQuestionType; options?: string[]; required: boolean; active: boolean; position: number }`
  - `interface IntakeAnswerSnapshot { key: string; label: string; type: IntakeQuestionType; value: string | boolean }`
  - `MAX_INTAKE_QUESTIONS: number` (= 10)
  - `getIntakeQuestions(settings: unknown): IntakeQuestion[]` — full list (active + inactive), used by the Ajustes editor.
  - `getActiveIntakeQuestions(settings: unknown): IntakeQuestion[]` — active only, sorted by `position`, used by the public form.
  - `slugifyQuestionKey(label: string, existingKeys: readonly string[]): string`
  - `validateIntakeQuestionsConfig(questions: IntakeQuestion[]): { ok: true } | { ok: false; error: string }`
  - `validateCustomAnswers(questions: IntakeQuestion[], raw: unknown): { ok: true; snapshots: IntakeAnswerSnapshot[] } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/intakeQuestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getIntakeQuestions,
  getActiveIntakeQuestions,
  slugifyQuestionKey,
  validateIntakeQuestionsConfig,
  validateCustomAnswers,
  MAX_INTAKE_QUESTIONS,
  type IntakeQuestion,
} from "@/lib/intakeQuestions";

const base = (over: Partial<IntakeQuestion> = {}): IntakeQuestion => ({
  key: "seguro_medico",
  label: "¿Tienes seguro médico?",
  type: "boolean",
  required: false,
  active: true,
  position: 0,
  ...over,
});

describe("getIntakeQuestions / getActiveIntakeQuestions", () => {
  it("lee el array desde settings.custom_intake_questions, ignora basura", () => {
    expect(getIntakeQuestions(null)).toEqual([]);
    expect(getIntakeQuestions({})).toEqual([]);
    expect(getIntakeQuestions({ custom_intake_questions: "no-es-array" })).toEqual([]);
    const settings = { custom_intake_questions: [base()] };
    expect(getIntakeQuestions(settings)).toEqual([base()]);
  });

  it("getActiveIntakeQuestions filtra inactivas y ordena por position", () => {
    const settings = {
      custom_intake_questions: [
        base({ key: "b", position: 1, active: true }),
        base({ key: "a", position: 0, active: true }),
        base({ key: "c", position: 2, active: false }),
      ],
    };
    expect(getActiveIntakeQuestions(settings).map((q) => q.key)).toEqual(["a", "b"]);
  });
});

describe("slugifyQuestionKey", () => {
  it("genera un slug legible sin acentos ni mayúsculas", () => {
    expect(slugifyQuestionKey("¿Tienes Seguro Médico?", [])).toBe("tienes_seguro_medico");
  });

  it("agrega sufijo numérico si el slug ya existe", () => {
    expect(slugifyQuestionKey("Seguro", ["seguro"])).toBe("seguro_2");
    expect(slugifyQuestionKey("Seguro", ["seguro", "seguro_2"])).toBe("seguro_3");
  });

  it("usa un fallback si el label no deja caracteres válidos", () => {
    expect(slugifyQuestionKey("???", [])).toBe("pregunta");
  });
});

describe("validateIntakeQuestionsConfig", () => {
  it("rechaza más de MAX_INTAKE_QUESTIONS preguntas", () => {
    const many = Array.from({ length: MAX_INTAKE_QUESTIONS + 1 }, (_, i) =>
      base({ key: `q${i}`, position: i }),
    );
    const result = validateIntakeQuestionsConfig(many);
    expect(result.ok).toBe(false);
  });

  it("rechaza labels vacíos y claves duplicadas", () => {
    expect(validateIntakeQuestionsConfig([base({ label: "  " })]).ok).toBe(false);
    expect(
      validateIntakeQuestionsConfig([base({ key: "x" }), base({ key: "x" })]).ok,
    ).toBe(false);
  });

  it("exige entre 2 y 8 opciones únicas para type select", () => {
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["solo una"] }),
      ]).ok,
    ).toBe(false);
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["a", "a"] }),
      ]).ok,
    ).toBe(false);
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["a", "b"] }),
      ]).ok,
    ).toBe(true);
  });
});

describe("validateCustomAnswers", () => {
  const questions: IntakeQuestion[] = [
    base({ key: "seguro", label: "¿Tienes seguro?", type: "boolean", required: true }),
    base({ key: "plan", label: "¿Qué plan tienes?", type: "select", options: ["Básico", "Premium"], required: false }),
    base({ key: "nota", label: "Nota adicional", type: "text", required: false }),
  ];

  it("acepta respuestas válidas y produce snapshots con el label vigente", () => {
    const result = validateCustomAnswers(questions, { seguro: true, plan: "Premium" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshots).toEqual([
        { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
        { key: "plan", label: "¿Qué plan tienes?", type: "select", value: "Premium" },
      ]);
    }
  });

  it("rechaza si falta una pregunta required", () => {
    const result = validateCustomAnswers(questions, { plan: "Premium" });
    expect(result.ok).toBe(false);
  });

  it("rechaza una opción de select que no está en la lista permitida", () => {
    const result = validateCustomAnswers(questions, { seguro: true, plan: "Otro plan" });
    expect(result.ok).toBe(false);
  });

  it("rechaza tipo incorrecto (boolean como string)", () => {
    const result = validateCustomAnswers(questions, { seguro: "true" });
    expect(result.ok).toBe(false);
  });

  it("ignora claves que no corresponden a ninguna pregunta activa", () => {
    const result = validateCustomAnswers(questions, {
      seguro: true,
      clave_inventada: "lo que sea",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshots.some((s) => s.key === "clave_inventada")).toBe(false);
    }
  });

  it("con lista de preguntas vacía, cualquier respuesta se ignora sin error", () => {
    const result = validateCustomAnswers([], { seguro: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intakeQuestions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/intakeQuestions'`

- [ ] **Step 3: Write the implementation**

Create `lib/intakeQuestions.ts`:

```ts
import { z } from "zod";

export type IntakeQuestionType = "text" | "boolean" | "select";

export interface IntakeQuestion {
  key: string;
  label: string;
  type: IntakeQuestionType;
  options?: string[];
  required: boolean;
  active: boolean;
  position: number;
}

export interface IntakeAnswerSnapshot {
  key: string;
  label: string;
  type: IntakeQuestionType;
  value: string | boolean;
}

export const MAX_INTAKE_QUESTIONS = 10;

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.enum(["text", "boolean", "select"]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  active: z.boolean(),
  position: z.number().int(),
});

// Lee la lista completa (activas e inactivas) desde clinics.settings — usada
// por el editor de Ajustes. Config corrupta o ausente devuelve [] (nunca
// rompe la página de Ajustes ni el formulario público).
export function getIntakeQuestions(settings: unknown): IntakeQuestion[] {
  const raw = (settings as Record<string, unknown> | null)?.custom_intake_questions;
  if (!Array.isArray(raw)) return [];
  const parsed = z.array(questionSchema).safeParse(raw);
  return parsed.success ? (parsed.data as IntakeQuestion[]) : [];
}

// Solo las preguntas que se muestran en el formulario público de alta, en
// orden de despliegue.
export function getActiveIntakeQuestions(settings: unknown): IntakeQuestion[] {
  return getIntakeQuestions(settings)
    .filter((q) => q.active)
    .sort((a, b) => a.position - b.position);
}

// Slug estable a partir del label (para el `key` interno). Se genera una vez
// al crear la pregunta y no cambia aunque se edite el label después.
export function slugifyQuestionKey(label: string, existingKeys: readonly string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "pregunta";
  if (!existingKeys.includes(base)) return base;
  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

// Valida la config completa antes de guardarla en clinics.settings (Ajustes).
export function validateIntakeQuestionsConfig(questions: IntakeQuestion[]): ValidationResult {
  if (questions.length > MAX_INTAKE_QUESTIONS)
    return { ok: false, error: `Máximo ${MAX_INTAKE_QUESTIONS} preguntas.` };

  const keys = new Set<string>();
  for (const q of questions) {
    if (!q.label.trim()) return { ok: false, error: "Cada pregunta necesita un texto." };
    if (keys.has(q.key))
      return { ok: false, error: "Hay preguntas con la misma clave interna." };
    keys.add(q.key);

    if (q.type === "select") {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      const unique = new Set(opts);
      if (opts.length < 2 || opts.length > 8)
        return { ok: false, error: `"${q.label}" necesita entre 2 y 8 opciones.` };
      if (unique.size !== opts.length)
        return { ok: false, error: `"${q.label}" tiene opciones repetidas.` };
    }
  }
  return { ok: true };
}

export type CustomAnswersValidation =
  | { ok: true; snapshots: IntakeAnswerSnapshot[] }
  | { ok: false; error: string };

// Valida las respuestas del paciente contra las preguntas ACTIVAS de la
// clínica y produce el snapshot que se guarda (label congelado al momento de
// responder). Cualquier clave que no corresponda a una pregunta activa se
// ignora silenciosamente (defensa en profundidad: el cliente no controla qué
// se guarda).
export function validateCustomAnswers(
  questions: IntakeQuestion[],
  raw: unknown,
): CustomAnswersValidation {
  const answers = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const snapshots: IntakeAnswerSnapshot[] = [];

  for (const q of questions) {
    const value = answers[q.key];

    if (q.type === "boolean") {
      if (value === undefined || value === null) {
        if (q.required) return { ok: false, error: `Falta responder: ${q.label}` };
        continue;
      }
      if (typeof value !== "boolean")
        return { ok: false, error: `Respuesta inválida para: ${q.label}` };
      snapshots.push({ key: q.key, label: q.label, type: q.type, value });
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (q.required) return { ok: false, error: `Falta responder: ${q.label}` };
      continue;
    }
    if (q.type === "select" && !(q.options ?? []).includes(text))
      return { ok: false, error: `Respuesta inválida para: ${q.label}` };
    snapshots.push({ key: q.key, label: q.label, type: q.type, value: text });
  }

  return { ok: true, snapshots };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/intakeQuestions.test.ts`
Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/intakeQuestions.ts tests/intakeQuestions.test.ts
git commit -m "feat(intake): dominio de preguntas adicionales de registro por clinica"
```

---

### Task 2: Migration + feature flag registration

**Files:**
- Create: `supabase/migrations/0097_intake_custom_answers.sql`
- Modify: `lib/features.ts:37` (add `FeatureKey`), `lib/features.ts:110` (add `FEATURES` entry), `lib/features.ts:126` (add to `ADDON_GROUPS`)
- Test: `tests/features-preset.test.ts` (extend existing file)

**Interfaces:**
- Consumes: none new.
- Produces: DB columns `anamnesis_invitations.submitted_custom` and `patients.custom_intake_answers` (both jsonb), and `FeatureKey` value `"preguntas_registro"` used by every later task's feature-flag checks (`features.preguntas_registro`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0097_intake_custom_answers.sql`:

```sql
-- Respuestas a las preguntas adicionales de registro configuradas por cada
-- clínica (ver lib/intakeQuestions.ts). Ambas columnas guardan un array de
-- snapshots [{key, label, type, value}], no un mapa key->value: así una
-- respuesta ya guardada conserva su etiqueta aunque la clínica edite o borre
-- la pregunta después.
alter table anamnesis_invitations add column if not exists submitted_custom jsonb;
alter table patients add column if not exists custom_intake_answers jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd c:/dev/clinica-dental && npx supabase db push --local` (or `supabase db reset` if that's the project's usual local-refresh command — check `package.json` scripts for the exact one already used by this project before running).
Expected: migration `0097_intake_custom_answers` applies with no errors; `\d patients` in the local DB shows `custom_intake_answers jsonb not null default '[]'::jsonb`.

- [ ] **Step 3: Register the feature flag**

In `lib/features.ts`, add to the `FeatureKey` union (after `"odontogram_dictado_voz"`):

```ts
  | "odontogram_dictado_voz"
  | "preguntas_registro"
  | "google_calendar";
```

Add to the `FEATURES` array (right after the `odontogram_dictado_voz` entry):

```ts
  { key: "odontogram_dictado_voz", label: "Dictado por voz en odontograma", href: "/pacientes", optIn: true },
  { key: "preguntas_registro", label: "Preguntas adicionales de registro", href: "/pacientes", optIn: true },
```

Add `"preguntas_registro"` to the `"🦷 Ficha clínica y documentos"` group in `ADDON_GROUPS`:

```ts
  { label: "🦷 Ficha clínica y documentos", keys: ["recetas", "consentimientos", "fotos", "fotos_contador", "periodontograma", "odontograma_pediatrico", "odontogram_dictado_voz", "preguntas_registro"] },
```

- [ ] **Step 4: Write the failing test**

Open `tests/features-preset.test.ts` and add this case (it should already import `FEATURES`/`ADDON_GROUPS`/`normalizeFeatures` — reuse those imports, don't add new ones):

```ts
it("preguntas_registro es opt-in, apagado por defecto, y está en un grupo de ADDON_GROUPS", () => {
  const meta = FEATURES.find((f) => f.key === "preguntas_registro");
  expect(meta?.optIn).toBe(true);
  expect(normalizeFeatures({}).preguntas_registro).toBe(false);
  const inSomeGroup = ADDON_GROUPS.some((g) => g.keys.includes("preguntas_registro"));
  expect(inSomeGroup).toBe(true);
});
```

- [ ] **Step 5: Run test to verify it fails, then passes**

Run: `npx vitest run tests/features-preset.test.ts`
Expected: FAILs before Step 3's edits are saved, PASSes after (5 tests total in the file).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0097_intake_custom_answers.sql lib/features.ts tests/features-preset.test.ts
git commit -m "feat(intake): migracion de respuestas custom + addon preguntas_registro"
```

---

### Task 3: Ajustes — editor de preguntas (admin)

**Files:**
- Create: `components/ajustes/IntakeQuestionsPanel.tsx`
- Modify: `app/(dashboard)/ajustes/actions.ts` (add `saveIntakeQuestions`, append to end of file)
- Modify: `app/(dashboard)/ajustes/page.tsx` (fetch config + render section, gated by `features.preguntas_registro`)
- Test: `tests/intakeQuestionsPanel.test.tsx`

**Interfaces:**
- Consumes: `IntakeQuestion`, `validateIntakeQuestionsConfig`, `slugifyQuestionKey` from `lib/intakeQuestions` (Task 1); `assertClinicAdmin()`, `ActionState` from `app/(dashboard)/ajustes/actions.ts` (existing).
- Produces: `saveIntakeQuestions(questions: IntakeQuestion[]): Promise<ActionState>` (exported from `actions.ts`, consumed only by `IntakeQuestionsPanel`).

- [ ] **Step 1: Add the server action**

Append to `app/(dashboard)/ajustes/actions.ts` (after the `saveClinicalHours` function, reusing its existing imports of `createAdminClient`, `revalidatePath`):

```ts
// ============================================================================
// Preguntas adicionales de registro (addon "preguntas_registro").
// Lista de preguntas propias de la clínica que se agregan al final del
// formulario público de alta de paciente nuevo. Se guarda en
// clinics.settings.custom_intake_questions (mismo patrón que clinical_hours).
// ============================================================================

export async function saveIntakeQuestions(
  questions: IntakeQuestion[],
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const validation = validateIntakeQuestionsConfig(questions);
  if (!validation.ok) return { error: validation.error };

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", profile.clinicId)
    .single();

  const existing = (clinic?.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("clinics")
    .update({ settings: { ...existing, custom_intake_questions: questions } })
    .eq("id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
```

Add the import at the top of `app/(dashboard)/ajustes/actions.ts` (alongside the existing `import { can, type Role } from "@/lib/rbac";` line):

```ts
import {
  validateIntakeQuestionsConfig,
  type IntakeQuestion,
} from "@/lib/intakeQuestions";
```

- [ ] **Step 2: Write the failing component test**

Create `tests/intakeQuestionsPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { IntakeQuestionsPanel } from "@/components/ajustes/IntakeQuestionsPanel";

const saveIntakeQuestions = vi.fn();
vi.mock("@/app/(dashboard)/ajustes/actions", () => ({ saveIntakeQuestions }));

describe("IntakeQuestionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveIntakeQuestions.mockResolvedValue({ ok: true });
  });

  it("agrega una pregunta de texto y la envía al guardar", async () => {
    render(<IntakeQuestionsPanel initialQuestions={[]} canWrite />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    fireEvent.change(screen.getByPlaceholderText("Texto de la pregunta"), {
      target: { value: "¿Tienes seguro médico?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Configuración guardada.");
    expect(saveIntakeQuestions).toHaveBeenCalledWith([
      expect.objectContaining({
        key: "tienes_seguro_medico",
        label: "¿Tienes seguro médico?",
        type: "text",
        required: false,
        active: true,
        position: 0,
      }),
    ]);
  });

  it("elimina una pregunta existente antes de guardar", async () => {
    render(
      <IntakeQuestionsPanel
        initialQuestions={[
          { key: "a", label: "Pregunta A", type: "text", required: false, active: true, position: 0 },
        ]}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Eliminar pregunta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Configuración guardada.");
    expect(saveIntakeQuestions).toHaveBeenCalledWith([]);
  });

  it("muestra el error del servidor si falla el guardado", async () => {
    saveIntakeQuestions.mockResolvedValue({ error: "Máximo 10 preguntas." });
    render(<IntakeQuestionsPanel initialQuestions={[]} canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Máximo 10 preguntas.");
  });

  it("sin permiso de escritura, no muestra controles de edición", () => {
    render(
      <IntakeQuestionsPanel
        initialQuestions={[
          { key: "a", label: "Pregunta A", type: "text", required: false, active: true, position: 0 },
        ]}
        canWrite={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Agregar pregunta" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/intakeQuestionsPanel.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ajustes/IntakeQuestionsPanel'`

- [ ] **Step 4: Write the component**

Create `components/ajustes/IntakeQuestionsPanel.tsx`:

```tsx
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
  const [questions, setQuestions] = useState<IntakeQuestion[]>(initialQuestions);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addQuestion() {
    const key = slugifyQuestionKey("pregunta", questions.map((q) => q.key));
    setQuestions((prev) => [
      ...prev,
      { key, label: "", type: "text", required: false, active: true, position: prev.length },
    ]);
    setSaved(false);
  }

  function updateQuestion(index: number, patch: Partial<IntakeQuestion>) {
    setQuestions((prev) => {
      const next = [...prev];
      const current = next[index];
      const updated = { ...current, ...patch };
      // El key se deriva del label mientras la pregunta sea nueva y sin
      // guardar (label vacío al crearla); una vez tiene texto propio, el
      // usuario puede seguir editando el label sin que el key cambie de nuevo
      // salvo que siga siendo el slug por defecto "pregunta".
      if (patch.label !== undefined && (current.key === "pregunta" || current.key.startsWith("pregunta_"))) {
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
    const res = await saveIntakeQuestions(questions);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/intakeQuestionsPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Wire into the Ajustes page**

In `app/(dashboard)/ajustes/page.tsx`, add the import (alongside the existing `ClinicalHoursPanel` import):

```tsx
import { IntakeQuestionsPanel } from "@/components/ajustes/IntakeQuestionsPanel";
import { getIntakeQuestions } from "@/lib/intakeQuestions";
```

Add the data fetch (right after the existing `clinicalHours` block, reusing the same `isClinicAdmin`/`profile`/`supabase` already in scope):

```tsx
  // Preguntas adicionales de registro (addon "preguntas_registro").
  let intakeQuestions: ReturnType<typeof getIntakeQuestions> = [];
  if (isClinicAdmin && features.preguntas_registro && profile) {
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("settings")
      .eq("id", profile.clinicId)
      .single();
    intakeQuestions = getIntakeQuestions(clinicData?.settings);
  }
```

Add the section (right after the `Bloqueo por horario` section):

```tsx
      {isClinicAdmin && features.preguntas_registro && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">
            Preguntas adicionales de registro
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Se agregan al final del formulario de alta que el paciente completa
            por WhatsApp. Máximo 10 preguntas.
          </p>
          <IntakeQuestionsPanel initialQuestions={intakeQuestions} canWrite={canWrite} />
        </section>
      )}
```

- [ ] **Step 7: Commit**

```bash
git add components/ajustes/IntakeQuestionsPanel.tsx tests/intakeQuestionsPanel.test.tsx "app/(dashboard)/ajustes/actions.ts" "app/(dashboard)/ajustes/page.tsx"
git commit -m "feat(ajustes): editor de preguntas adicionales de registro"
```

---

### Task 4: Formulario público de alta — mostrar y validar las preguntas

**Files:**
- Modify: `app/h/[token]/page.tsx`
- Modify: `app/h/[token]/PublicAnamnesisForm.tsx`
- Modify: `app/h/[token]/submit-action.ts`
- Test: `tests/public-anamnesis-submit.test.ts`

**Interfaces:**
- Consumes: `getActiveIntakeQuestions`, `validateCustomAnswers`, `IntakeQuestion` from `lib/intakeQuestions` (Task 1).
- Produces: `PublicAnamnesisForm` gains prop `customQuestions: IntakeQuestion[]` (default-safe: renders nothing extra when empty); `submitPublicAnamnesis` writes `submitted_custom` on the invitation row when `kind === "new"`.

- [ ] **Step 1: Write the failing test for submit-action validation**

Create `tests/public-anamnesis-submit.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit,
  clientIp: () => "127.0.0.1",
  tooManyRequestsMessage: (s: number) => `Espera ${s}s`,
}));

function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "single", "maybeSingle"]) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let inviteResult: { data: unknown };
let clinicResult: { data: unknown };
let updatePayload: Record<string, unknown> | null = null;
const from = vi.fn((table: string) => {
  if (table === "anamnesis_invitations") {
    return {
      ...chain(inviteResult),
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chain({ data: null, error: null });
      },
    };
  }
  return chain(clinicResult);
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

const { submitPublicAnamnesis } = await import("@/app/h/[token]/submit-action");

const NOW = Date.now();

function form(overrides: { custom?: unknown; personal?: Record<string, unknown> } = {}) {
  const fd = new FormData();
  fd.set("anamnesis", JSON.stringify({}));
  fd.set("allergies", "");
  fd.set("medical_alerts", "");
  fd.set("personal", JSON.stringify({ full_name: "Paciente Test", ...(overrides.personal ?? {}) }));
  if (overrides.custom !== undefined) fd.set("custom", JSON.stringify(overrides.custom));
  return fd;
}

describe("submitPublicAnamnesis — preguntas adicionales (kind: new)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePayload = null;
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
    inviteResult = {
      data: {
        id: "inv-1",
        kind: "new",
        patient_id: null,
        clinic_id: "clinic-1",
        expires_at: new Date(NOW + 60_000).toISOString(),
        completed_at: null,
      },
    };
    clinicResult = {
      data: {
        settings: {
          custom_intake_questions: [
            { key: "seguro", label: "¿Tienes seguro?", type: "boolean", required: true, active: true, position: 0 },
          ],
        },
      },
    };
  });

  it("rechaza si falta una pregunta obligatoria", async () => {
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: {} }));
    expect(result.error).toContain("Falta responder");
    expect(updatePayload).toBeNull();
  });

  it("guarda el snapshot en submitted_custom cuando la respuesta es válida", async () => {
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: { seguro: true } }));
    expect(result.ok).toBe(true);
    expect(updatePayload?.submitted_custom).toEqual([
      { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
    ]);
  });

  it("ignora una clave que no corresponde a ninguna pregunta activa", async () => {
    const result = await submitPublicAnamnesis(
      "tok",
      {},
      form({ custom: { seguro: true, inventada: "x" } }),
    );
    expect(result.ok).toBe(true);
    expect(
      (updatePayload?.submitted_custom as { key: string }[]).some((s) => s.key === "inventada"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/public-anamnesis-submit.test.ts`
Expected: FAIL — either "Falta responder" assertion fails or `updatePayload.submitted_custom` is `undefined` (the current `submit-action.ts` doesn't read custom questions yet).

- [ ] **Step 3: Update `submit-action.ts`**

In `app/h/[token]/submit-action.ts`, add the import:

```ts
import { getActiveIntakeQuestions, validateCustomAnswers } from "@/lib/intakeQuestions";
```

Inside the `if (invite.kind === "new") { ... }` block (right after `submittedPersonal = person.data;`), add:

```ts
    const { data: clinicRow } = await admin
      .from("clinics")
      .select("settings")
      .eq("id", invite.clinic_id)
      .single();
    const activeQuestions = getActiveIntakeQuestions(clinicRow?.settings);

    let customRaw: unknown = {};
    if (formData.get("custom")) {
      try {
        customRaw = JSON.parse(String(formData.get("custom")));
      } catch {
        return { error: "Respuestas adicionales inválidas." };
      }
    }
    const customResult = validateCustomAnswers(activeQuestions, customRaw);
    if (!customResult.ok) return { error: customResult.error };
```

Then include the snapshots in the update call. Change:

```ts
  const { error: saveError } = await admin
    .from("anamnesis_invitations")
    .update({
      submitted_data: data,
      submitted_personal: submittedPersonal,
      submitted_allergies: csvToArray(formData.get("allergies")),
      submitted_alerts: csvToArray(formData.get("medical_alerts")),
      completed_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
```

to:

```ts
  const { error: saveError } = await admin
    .from("anamnesis_invitations")
    .update({
      submitted_data: data,
      submitted_personal: submittedPersonal,
      submitted_custom: invite.kind === "new" ? customResultSnapshots : null,
      submitted_allergies: csvToArray(formData.get("allergies")),
      submitted_alerts: csvToArray(formData.get("medical_alerts")),
      completed_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
```

Since `customResult` (and its `.snapshots`) is only declared inside the `if (invite.kind === "new")` block, hoist a variable above that block so it's in scope for the final update call. Right before `let submittedPersonal: Record<string, unknown> | null = null;`, add:

```ts
  let customResultSnapshots: unknown[] | null = null;
```

And inside the `new` block, after the `validateCustomAnswers` call succeeds, set it:

```ts
    customResultSnapshots = customResult.snapshots;
```

(Full resulting shape of that block — for reference, not a separate step: `submittedPersonal`, `activeQuestions`, `customResultSnapshots` are all assigned before the function falls through to the final `update`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/public-anamnesis-submit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update the public form to render and submit custom questions**

In `app/h/[token]/page.tsx`, change the clinic query from `.select("name")` to `.select("name, settings")`, and pass the questions down. Replace:

```tsx
  const { data: clinic } = await admin
    .from("clinics")
    .select("name")
    .eq("id", invite.clinic_id)
    .maybeSingle();
```

with:

```tsx
  const { data: clinic } = await admin
    .from("clinics")
    .select("name, settings")
    .eq("id", invite.clinic_id)
    .maybeSingle();
```

Add the import at the top:

```tsx
import { getActiveIntakeQuestions } from "@/lib/intakeQuestions";
```

Change the final render to pass `customQuestions` (only meaningful for `isNew`, empty array otherwise):

```tsx
      <PublicAnamnesisForm
        token={token}
        kind={isNew ? "new" : "existing"}
        clinicName={clinic?.name ?? "la clínica"}
        patientName={patientName}
        initialData={EMPTY_ANAMNESIS}
        initialAllergies=""
        initialAlerts=""
        customQuestions={isNew ? getActiveIntakeQuestions(clinic?.settings) : []}
      />
```

- [ ] **Step 6: Update `PublicAnamnesisForm.tsx`**

Add the import:

```tsx
import type { IntakeQuestion } from "@/lib/intakeQuestions";
```

Add the prop to the component signature (default `[]` so existing callers/tests without it don't break):

```tsx
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
```

Add state (alongside the existing `useState` calls):

```tsx
  const [custom, setCustom] = useState<Record<string, string | boolean>>({});
```

In `submit()`, validate required custom questions client-side (server is still the authority) and append the field. Replace:

```ts
  function submit() {
    if (isNew && !person.full_name.trim()) {
      setLocalError("Por favor escriba su nombre completo.");
      return;
    }
    setLocalError(null);
    const fd = new FormData();
    fd.append("anamnesis", JSON.stringify(a));
    fd.append("allergies", allergies);
    fd.append("medical_alerts", alerts);
    if (isNew) fd.append("personal", JSON.stringify(person));
    startTransition(() => formAction(fd));
  }
```

with:

```ts
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
```

Add the render section right after the "Datos personales" `{isNew && (...)}` block and before the "Antecedentes" `<section>`:

```tsx
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
```

- [ ] **Step 7: Manual smoke test**

Run `npm run dev`, enable the `preguntas_registro` addon for a test clinic (same SQL-patch approach used earlier this session for `odontogram_dictado_voz` — `PATCH` the clinic's `features` jsonb), add one `text` and one `boolean` question in Ajustes, generate a new-patient WhatsApp link from "Registrar por WhatsApp", open `/h/<token>` and confirm the questions render, block submit when the boolean is unanswered if marked required, and succeed otherwise.

- [ ] **Step 8: Commit**

```bash
git add "app/h/[token]/page.tsx" "app/h/[token]/PublicAnamnesisForm.tsx" "app/h/[token]/submit-action.ts" tests/public-anamnesis-submit.test.ts
git commit -m "feat(intake): mostrar y validar preguntas adicionales en el formulario publico"
```

---

### Task 5: Panel de revisión ("Registros entrantes") — mostrar y aplicar respuestas custom

**Files:**
- Modify: `app/(dashboard)/pacientes/page.tsx`
- Modify: `components/patients/IncomingIntakesPanel.tsx`
- Modify: `components/patients/ReviewAnamnesisModal.tsx`
- Modify: `app/(dashboard)/pacientes/anamnesis-invitation-actions.ts`

**Interfaces:**
- Consumes: `IntakeAnswerSnapshot` type from `lib/intakeQuestions` (Task 1).
- Produces: `IntakeItem.customAnswers: IntakeAnswerSnapshot[]` (new field, always an array — empty when there are none), threaded through to `ReviewAnamnesisModal` for read-only display, and copied verbatim into `patients.custom_intake_answers` when an intake is approved.

- [ ] **Step 1: Extend the query and `IntakeItem` type**

In `app/(dashboard)/pacientes/page.tsx`, add `submitted_custom` to the select list. Change:

```tsx
        .select(
          "id, contact_name, contact_phone, completed_at, expires_at, submitted_personal, submitted_data, submitted_allergies, submitted_alerts, source",
        )
```

to:

```tsx
        .select(
          "id, contact_name, contact_phone, completed_at, expires_at, submitted_personal, submitted_data, submitted_allergies, submitted_alerts, submitted_custom, source",
        )
```

Add the field when building `item` (right after the `proposed:` entry):

```tsx
        customAnswers: (r.submitted_custom as IntakeAnswerSnapshot[] | null) ?? [],
```

Add the import at the top:

```tsx
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";
```

- [ ] **Step 2: Extend `IntakeItem` and pass the field through**

In `components/patients/IncomingIntakesPanel.tsx`, add the import:

```tsx
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";
```

Add the field to the `IntakeItem` type:

```tsx
export type IntakeItem = {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  completedAt: string | null;
  source: string;
  personal: PatientIntake | null;
  proposed: { data: Anamnesis; allergies: string[]; alerts: string[] } | null;
  customAnswers: IntakeAnswerSnapshot[];
};
```

Pass it to the modal. Change:

```tsx
      {reviewItem?.proposed && (
        <ReviewAnamnesisModal
          invitationId={reviewItem.id}
          kind="new"
          proposed={reviewItem.proposed}
          personal={reviewItem.personal}
          canEdit
          onClose={() => setReviewId(null)}
          onDone={(patientId) => {
            setReviewId(null);
            if (patientId) router.push(`/pacientes/${patientId}`);
            else router.refresh();
          }}
        />
      )}
```

to:

```tsx
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
```

- [ ] **Step 3: Render read-only custom answers in the review modal**

In `components/patients/ReviewAnamnesisModal.tsx`, add the import:

```tsx
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";
```

Add the prop (default `[]`):

```tsx
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
  canEdit?: boolean;
  onClose: () => void;
  onDone: (patientId?: string) => void;
}) {
```

Render it read-only in the non-editing view, right after the "Datos personales" `<dl>` block and before the main `<dl className="space-y-3 text-sm">`:

```tsx
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
```

- [ ] **Step 4: Copy the snapshot when the intake is approved**

In `app/(dashboard)/pacientes/anamnesis-invitation-actions.ts`, add `submitted_custom` to the select list in `applyAnamnesisInvitation`. Change:

```ts
    .select(
      "id, kind, patient_id, clinic_id, completed_at, reviewed_at, submitted_data, submitted_personal, submitted_allergies, submitted_alerts",
    )
```

to:

```ts
    .select(
      "id, kind, patient_id, clinic_id, completed_at, reviewed_at, submitted_data, submitted_personal, submitted_allergies, submitted_alerts, submitted_custom",
    )
```

Add the field to the `patients` insert (inside the `if (isNew) { ... }` block, in the `.insert({ ... })` call):

```ts
        anamnesis_data: anamnesis,
        allergies,
        medical_alerts: alerts,
        custom_intake_answers: (invite.submitted_custom as unknown[] | null) ?? [],
      })
```

(the `custom_intake_answers` line is new; everything else in that `.insert({...})` call is unchanged.)

- [ ] **Step 5: Manual smoke test**

Using the same test clinic from Task 4's smoke test: register a new patient through `/h/<token>` answering the custom questions, open "Registros entrantes" in `/pacientes`, click "Revisar", confirm the "Preguntas adicionales" block shows the answers, click "Crear paciente", and confirm the created patient exists (this hands off to Task 6 to actually display them on the file).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/pacientes/page.tsx" components/patients/IncomingIntakesPanel.tsx components/patients/ReviewAnamnesisModal.tsx "app/(dashboard)/pacientes/anamnesis-invitation-actions.ts"
git commit -m "feat(intake): mostrar y aplicar respuestas custom en Registros entrantes"
```

---

### Task 6: Ficha del paciente — sección "Preguntas adicionales"

**Files:**
- Create: `components/patients/CustomIntakeAnswers.tsx`
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`
- Test: `tests/customIntakeAnswers.test.tsx`

**Interfaces:**
- Consumes: `IntakeAnswerSnapshot` from `lib/intakeQuestions` (Task 1).
- Produces: `<CustomIntakeAnswers answers={...} />` — a presentational, read-only component (no server action, no state).

- [ ] **Step 1: Write the failing test**

Create `tests/customIntakeAnswers.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomIntakeAnswers } from "@/components/patients/CustomIntakeAnswers";

describe("CustomIntakeAnswers", () => {
  it("no renderiza nada si no hay respuestas", () => {
    const { container } = render(<CustomIntakeAnswers answers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra label y valor de cada respuesta, traduciendo boolean a Sí/No", () => {
    render(
      <CustomIntakeAnswers
        answers={[
          { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
          { key: "plan", label: "¿Qué plan?", type: "select", value: "Premium" },
        ]}
      />,
    );
    expect(screen.getByText("¿Tienes seguro?")).toBeTruthy();
    expect(screen.getByText("Sí")).toBeTruthy();
    expect(screen.getByText("¿Qué plan?")).toBeTruthy();
    expect(screen.getByText("Premium")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/customIntakeAnswers.test.tsx`
Expected: FAIL — `Cannot find module '@/components/patients/CustomIntakeAnswers'`

- [ ] **Step 3: Write the component**

Create `components/patients/CustomIntakeAnswers.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/customIntakeAnswers.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into the patient file**

In `app/(dashboard)/pacientes/[id]/page.tsx`, add `custom_intake_answers` to the patient select list. Change:

```tsx
    .select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, referral_source, referral_source_other, allergies, medical_alerts, anamnesis, anamnesis_data, evolution")
```

to:

```tsx
    .select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, referral_source, referral_source_other, allergies, medical_alerts, anamnesis, anamnesis_data, evolution, custom_intake_answers")
```

Add the import:

```tsx
import { CustomIntakeAnswers } from "@/components/patients/CustomIntakeAnswers";
import type { IntakeAnswerSnapshot } from "@/lib/intakeQuestions";
```

Render it right after the "Antecedentes médicos" `<section>` (the one wrapping `<AnamnesisPanel>`):

```tsx
      <CustomIntakeAnswers
        answers={((patient as { custom_intake_answers?: unknown }).custom_intake_answers as IntakeAnswerSnapshot[] | null) ?? []}
      />
```

- [ ] **Step 6: Manual smoke test**

Open the patient created in Task 5's smoke test and confirm the "Preguntas adicionales" section appears with the same answers shown during review.

- [ ] **Step 7: Run the full suite before wrapping up**

Run: `npx vitest run`
Expected: all tests pass (existing suite + the ~27 new tests from Tasks 1, 2, 3, 4, and 6).

- [ ] **Step 8: Commit**

```bash
git add components/patients/CustomIntakeAnswers.tsx tests/customIntakeAnswers.test.tsx "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(intake): mostrar preguntas adicionales en la ficha del paciente"
```
