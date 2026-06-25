# Anamnesis Estructurada (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el campo de texto libre `patients.anamnesis` por un cuestionario médico estructurado (JSONB), editable solo por roles clínicos, mostrado en la ficha del paciente; conservar el texto antiguo como "anamnesis histórica" de solo lectura.

**Architecture:** Nueva columna `patients.anamnesis_data jsonb`. Un schema Zod (`lib/schemas/anamnesis.ts`) define la forma, los defaults y la lista única de campos de antecedentes. Un server action (`updateAnamnesis`) valida permisos (admin/odontologo/especialista/colega) + addon de horario, sella `actualizado_por`/`actualizado_en` en el servidor y persiste. Un client component (`AnamnesisPanel`) muestra resumen + formulario inline. `allergies`/`medical_alerts` siguen viviendo en sus columnas existentes (fuente de verdad para la cabecera roja).

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + RLS), Zod, React (`useActionState`), Tailwind, Vitest.

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé", "puedes" no "podés").
- NUNCA hacer `git push` sin autorización explícita del usuario.
- Usar primitivos de `components/ui/` (Button, Card, Field/fieldInputClass) y helpers `toast()` de `lib/toast`, `cn()` de `lib/cn`.
- Roles que pueden editar registro clínico: `admin`, `odontologo_general`, `especialista`, `colega` (NO `recepcionista`, NO `asistente`).
- RLS de `patients` ya cubre lectura/escritura por tenant; la restricción de rol para anamnesis se aplica en el server action (mismo patrón que `updatePatient`).
- Respetar el addon `bloqueo_horario` igual que `updatePatient` (helper `clinicalLocked` en `app/(dashboard)/pacientes/actions.ts`).
- Tests con Vitest en `tests/`; ejecutar con `npm test`.
- La fuente de verdad de alergias/alertas son las columnas `patients.allergies` / `patients.medical_alerts` (text[]), no el JSONB.

---

### Task 1: Migración — columna `anamnesis_data`

**Files:**
- Create: `supabase/migrations/0058_patient_anamnesis_data.sql`

**Interfaces:**
- Produces: columna `patients.anamnesis_data jsonb` (nullable, sin default).

- [ ] **Step 1: Escribir la migración**

```sql
-- 0058_patient_anamnesis_data.sql — Anamnesis estructurada (Fase 1)
-- Cuestionario médico estructurado en JSONB. El campo de texto libre
-- patients.anamnesis se conserva como "anamnesis histórica" de solo lectura.
-- Las alergias/alertas siguen viviendo en patients.allergies / medical_alerts.

alter table patients add column if not exists anamnesis_data jsonb;
```

- [ ] **Step 2: Aplicar la migración localmente y verificar**

Run: `npx supabase db push` (o el flujo de migración local que use el proyecto)
Expected: aplica sin error; la columna `anamnesis_data` existe en `patients`.

Si el proyecto aplica migraciones manualmente vía SQL Editor, verificar:
Run (psql/SQL): `select column_name from information_schema.columns where table_name='patients' and column_name='anamnesis_data';`
Expected: devuelve una fila `anamnesis_data`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0058_patient_anamnesis_data.sql
git commit -m "feat(historial): migración 0058 columna anamnesis_data jsonb

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Schema Zod + defaults (`lib/schemas/anamnesis.ts`)

**Files:**
- Create: `lib/schemas/anamnesis.ts`
- Test: `tests/anamnesis.test.ts`

**Interfaces:**
- Produces:
  - `ANTECEDENTES_FIELDS: { key: string; label: string }[]` — lista única de condiciones.
  - `HABITOS_FIELDS: { key: string; label: string }[]`.
  - `AnamnesisSchema` (Zod) y `type Anamnesis = z.infer<typeof AnamnesisSchema>`.
  - `EMPTY_ANAMNESIS: Anamnesis`.
  - `parseAnamnesis(value: unknown): Anamnesis` — normaliza objeto parcial/null a `Anamnesis` completo (tolerante, hace merge con `EMPTY_ANAMNESIS`).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/anamnesis.test.ts
import { describe, it, expect } from "vitest";
import {
  AnamnesisSchema,
  EMPTY_ANAMNESIS,
  parseAnamnesis,
  ANTECEDENTES_FIELDS,
} from "@/lib/schemas/anamnesis";

describe("anamnesis schema", () => {
  it("EMPTY_ANAMNESIS es válido contra el schema", () => {
    expect(AnamnesisSchema.safeParse(EMPTY_ANAMNESIS).success).toBe(true);
  });

  it("parseAnamnesis(null) devuelve el objeto vacío completo", () => {
    expect(parseAnamnesis(null)).toEqual(EMPTY_ANAMNESIS);
  });

  it("parseAnamnesis hace merge de un objeto parcial sin perder defaults", () => {
    const r = parseAnamnesis({ medicacion_habitual: "Aspirina" });
    expect(r.medicacion_habitual).toBe("Aspirina");
    expect(r.antecedentes.diabetes).toBe(false);
    expect(r.embarazo).toBe("no_aplica");
  });

  it("parseAnamnesis ignora claves desconocidas y conserva la forma", () => {
    const r = parseAnamnesis({ basura: 123, habitos: { tabaco: true } });
    expect(r.habitos.tabaco).toBe(true);
    expect("basura" in r).toBe(false);
  });

  it("ANTECEDENTES_FIELDS y el schema de antecedentes están sincronizados", () => {
    for (const f of ANTECEDENTES_FIELDS) {
      expect(EMPTY_ANAMNESIS.antecedentes).toHaveProperty(f.key);
    }
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npm test -- anamnesis`
Expected: FAIL — `Cannot find module '@/lib/schemas/anamnesis'`.

- [ ] **Step 3: Implementar el schema**

```ts
// lib/schemas/anamnesis.ts
import { z } from "zod";

// Lista ÚNICA de condiciones de antecedentes patológicos. UI y schema la usan.
export const ANTECEDENTES_FIELDS = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertensión" },
  { key: "cardiopatia", label: "Cardiopatía" },
  { key: "coagulacion", label: "Problemas de coagulación" },
  { key: "hepatitis", label: "Hepatitis" },
  { key: "vih", label: "VIH" },
  { key: "asma", label: "Asma" },
  { key: "epilepsia", label: "Epilepsia" },
] as const;

export const HABITOS_FIELDS = [
  { key: "tabaco", label: "Tabaco" },
  { key: "alcohol", label: "Alcohol" },
  { key: "bruxismo", label: "Bruxismo" },
] as const;

const antecedentesShape = Object.fromEntries(
  ANTECEDENTES_FIELDS.map((f) => [f.key, z.boolean().default(false)]),
) as Record<(typeof ANTECEDENTES_FIELDS)[number]["key"], z.ZodDefault<z.ZodBoolean>>;

const habitosShape = Object.fromEntries(
  HABITOS_FIELDS.map((f) => [f.key, z.boolean().default(false)]),
) as Record<(typeof HABITOS_FIELDS)[number]["key"], z.ZodDefault<z.ZodBoolean>>;

export const AnamnesisSchema = z.object({
  antecedentes: z
    .object({ ...antecedentesShape, otros: z.string().default("") })
    .default({}),
  medicacion_habitual: z.string().default(""),
  antecedentes_familiares: z.string().default(""),
  habitos: z.object({ ...habitosShape }).default({}),
  embarazo: z
    .enum(["no_aplica", "embarazada", "lactancia"])
    .default("no_aplica"),
  ultima_visita_odontologica: z.string().default(""),
  motivo_consulta: z.string().default(""),
  actualizado_por: z.string().default(""),
  actualizado_en: z.string().default(""),
});

export type Anamnesis = z.infer<typeof AnamnesisSchema>;

// El objeto vacío se deriva del propio schema parseando {} (aplica todos los defaults).
export const EMPTY_ANAMNESIS: Anamnesis = AnamnesisSchema.parse({});

// Normaliza cualquier valor (null, objeto parcial, basura) a un Anamnesis completo.
// safeParse aplica defaults y descarta claves desconocidas (strip por defecto).
export function parseAnamnesis(value: unknown): Anamnesis {
  const result = AnamnesisSchema.safeParse(value ?? {});
  return result.success ? result.data : EMPTY_ANAMNESIS;
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `npm test -- anamnesis`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add lib/schemas/anamnesis.ts tests/anamnesis.test.ts
git commit -m "feat(historial): schema Zod de anamnesis estructurada + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server action `updateAnamnesis`

**Files:**
- Create: `app/(dashboard)/pacientes/anamnesis-actions.ts`
- Test: `tests/anamnesis-action.test.ts`

**Interfaces:**
- Consumes: `AnamnesisSchema`, `parseAnamnesis` de Task 2; `can`/`Role` de `lib/rbac`; `getProfile` de `lib/auth`; `createClient` de `lib/supabase/server`; `clinicalLocked` (re-exportar o duplicar el helper — ver Step 3).
- Produces:
  - `type ActionState = { error?: string; ok?: boolean }`
  - `updateAnamnesis(patientId: string, _prev: ActionState, formData: FormData): Promise<ActionState>`
  - `canEditAnamnesis(role: string | undefined): boolean` — exportada para test y reutilización por el panel.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/anamnesis-action.test.ts
import { describe, it, expect } from "vitest";
import { canEditAnamnesis } from "@/app/(dashboard)/pacientes/anamnesis-actions";

describe("canEditAnamnesis", () => {
  it("permite a roles clínicos", () => {
    for (const r of ["admin", "odontologo_general", "especialista", "colega"]) {
      expect(canEditAnamnesis(r)).toBe(true);
    }
  });
  it("niega a recepcionista, asistente y desconocidos", () => {
    for (const r of ["recepcionista", "asistente", undefined, "otro"]) {
      expect(canEditAnamnesis(r as string | undefined)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npm test -- anamnesis-action`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar el action**

Nota: `clinicalLocked` es privado en `actions.ts`. Para no exportar de más, duplicar el mismo helper aquí (es de pocas líneas y mantiene cada archivo autocontenido). Si se prefiere DRY, extraerlo a `lib/clinicalHours` — pero para esta entrega se duplica para no tocar `actions.ts`.

```ts
// app/(dashboard)/pacientes/anamnesis-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { AnamnesisSchema, parseAnamnesis } from "@/lib/schemas/anamnesis";

export type ActionState = { error?: string; ok?: boolean };

const CLINICAL_ROLES = new Set([
  "admin",
  "odontologo_general",
  "especialista",
  "colega",
]);

export function canEditAnamnesis(role: string | undefined): boolean {
  return role ? CLINICAL_ROLES.has(role) : false;
}

// Mismo criterio que actions.ts: el admin queda exento; con el addon
// bloqueo_horario activo, los demás solo guardan dentro de la ventana clínica.
async function clinicalLocked(role: string, clinicId: string): Promise<boolean> {
  if (role === "admin") return false;
  const features = await getClinicFeatures();
  if (!features.bloqueo_horario) return false;
  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();
  return !withinClinicalHours(clinic?.settings);
}

function csvToArray(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateAnamnesis(
  patientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canEditAnamnesis(profile.role))
    return { error: "Sin permiso para editar antecedentes médicos." };

  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Registro clínico bloqueado fuera del horario de la clínica." };

  // El cliente envía el JSON de la anamnesis en el campo "anamnesis".
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("anamnesis") ?? "{}"));
  } catch {
    return { error: "Datos de anamnesis inválidos." };
  }

  const parsed = AnamnesisSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  // Sellar autor/fecha en el servidor (no confiar en el cliente).
  const data = {
    ...parseAnamnesis(parsed.data),
    actualizado_por: profile.fullName ?? "",
    actualizado_en: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      anamnesis_data: data,
      allergies: csvToArray(formData.get("allergies")),
      medical_alerts: csvToArray(formData.get("medical_alerts")),
    })
    .eq("id", patientId)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npm test -- anamnesis-action`
Expected: PASS (2 tests).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (Confirmar que `profile.fullName` y `profile.clinicId` existen en el tipo de `getProfile`; ya se usan en `page.tsx` y `history-actions.ts`.)

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/pacientes/anamnesis-actions.ts tests/anamnesis-action.test.ts
git commit -m "feat(historial): server action updateAnamnesis con guard de rol y horario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Componente `AnamnesisPanel`

**Files:**
- Create: `components/patients/AnamnesisPanel.tsx`

**Interfaces:**
- Consumes: `updateAnamnesis`, `type ActionState` de Task 3; `Anamnesis`, `parseAnamnesis`, `ANTECEDENTES_FIELDS`, `HABITOS_FIELDS` de Task 2; `Button`, `Card` de `components/ui/`; `fieldInputClass`, `FieldLabel` de `components/ui/Field`; `toast` de `lib/toast`.
- Produces: `AnamnesisPanel({ patientId, anamnesis, allergies, medicalAlerts, legacyAnamnesis, canEdit })`.

- [ ] **Step 1: Implementar el componente**

```tsx
// components/patients/AnamnesisPanel.tsx
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
    (f) => (a.antecedentes as Record<string, boolean>)[f.key],
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
                checked={(a.antecedentes as Record<string, boolean>)[f.key]}
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
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add components/patients/AnamnesisPanel.tsx
git commit -m "feat(historial): AnamnesisPanel (vista resumen + formulario)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Integrar en la ficha del paciente

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `AnamnesisPanel` de Task 4; `parseAnamnesis` de Task 2; `canEditAnamnesis` de Task 3.

- [ ] **Step 1: Cargar `anamnesis_data` en el select del paciente**

En el `.select(...)` de `patients` (línea ~49), añadir `anamnesis_data`:

```ts
.select("id, clinic_id, full_name, national_id, dob, sex, phone, email, address, allergies, medical_alerts, anamnesis, anamnesis_data, evolution")
```

- [ ] **Step 2: Importar el panel y los helpers**

Junto a los demás imports de `components/patients/`:

```ts
import { AnamnesisPanel } from "@/components/patients/AnamnesisPanel";
import { parseAnamnesis } from "@/lib/schemas/anamnesis";
import { canEditAnamnesis } from "@/app/(dashboard)/pacientes/anamnesis-actions";
```

- [ ] **Step 3: Renderizar la sección antes del Odontograma**

Insertar esta sección justo después del `</header>` (antes de `<section>...Odontograma...`):

```tsx
      <section>
        <h2 className="mb-3 text-lg font-semibold">Antecedentes médicos</h2>
        <AnamnesisPanel
          patientId={patient.id}
          anamnesis={parseAnamnesis((patient as { anamnesis_data?: unknown }).anamnesis_data)}
          allergies={patient.allergies ?? []}
          medicalAlerts={patient.medical_alerts ?? []}
          legacyAnamnesis={(patient as { anamnesis?: string | null }).anamnesis ?? null}
          canEdit={canEditAnamnesis(profile?.role)}
        />
      </section>
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

Run: `npm run build` (o `rtk next build`)
Expected: build exitoso, ruta `/pacientes/[id]` compila.

- [ ] **Step 5: Verificación manual**

Iniciar `npm run dev`, entrar a una ficha de paciente como `doctor@sonrisa.com` (password123):
- Aparece la sección "Antecedentes médicos" arriba con botón "Editar antecedentes".
- Editar, marcar condiciones, guardar → toast de éxito, resumen actualizado, "Actualizado por … · fecha".
- Entrar como `recepcion@sonrisa.com`: la sección se ve pero **sin** botón de editar.
- Si la ficha tenía texto en `anamnesis`, aparece "Anamnesis histórica (sin estructurar)" colapsable.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(historial): integrar AnamnesisPanel en la ficha del paciente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Suite completa y cierre

- [ ] **Step 1: Ejecutar toda la suite de tests**

Run: `npm test`
Expected: pasan los tests nuevos de anamnesis. (Nota: el proyecto tiene ~5 fallos preexistentes no relacionados — doctorColor y feature flags de WhatsApp; no son regresiones de esta entrega.)

- [ ] **Step 2: Verificación de tipos final**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 3: Revisar el diff completo**

Run: `git log --oneline -6` y `git diff main --stat` (si aplica)
Expected: 6 commits coherentes (migración, schema, action, panel, integración).

> **Despliegue:** la migración 0058 debe aplicarse en la base de **producción**
> (Supabase nube, SQL Editor) además de local. NO hacer `git push` sin autorización
> explícita del usuario.

---

## Self-Review (cobertura del spec)

- Anamnesis estructurada JSONB → Task 1 (columna) + Task 2 (schema).
- `anamnesis` text conservado como histórico de solo lectura → Task 4 (bloque colapsable) + Task 5 (prop `legacyAnamnesis`).
- Alergias/alertas como fuente de verdad en sus columnas → Task 3 (persistencia) + Task 4 (campos del form).
- Permisos (admin/odontologo/especialista/colega editan; recepcionista no) → Task 3 (`canEditAnamnesis`, guard en action) + Task 5 (`canEdit` prop).
- Addon `bloqueo_horario` respetado → Task 3 (`clinicalLocked`).
- `actualizado_por`/`actualizado_en` sellados en el server → Task 3.
- Tolerancia a fichas viejas (columna null / campos nuevos) → Task 2 (`parseAnamnesis`) usado en Task 4 y 5.
- Tests (schema + permisos) → Task 2 y Task 3.
- UI con primitivos `components/ui/` → Task 4.
- No incluido (YAGNI): auditoría de versiones de anamnesis, migración automática del texto, plantillas por especialidad — correctamente fuera del plan.
