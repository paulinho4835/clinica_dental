# Recetas Médicas y Presupuesto de Tratamientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar recetas médicas guardadas en historial y renombrar el botón de impresión del plan como "Presupuesto" dentro de la ficha del paciente.

**Architecture:** Una nueva tabla `prescriptions` en Supabase con RLS heredada del patrón `auth_clinic_id()`. Un Server Action con validación pura testeable. Modal client-side para el editor de medicamentos. Página de impresión en el route group `(print)` existente, usando `AutoPrint`/`PrintButtons` ya existentes. El presupuesto reutiliza la página de impresión existente con un cambio cosmético de título.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres + RLS), Tailwind CSS, Server Actions, Vitest, route group `(print)`.

---

## Mapa de archivos

| Acción | Ruta |
|--------|------|
| Crear | `supabase/migrations/0028_prescriptions.sql` |
| Crear | `app/(dashboard)/pacientes/prescription-actions.ts` |
| Crear | `tests/prescription-actions.test.ts` |
| Crear | `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx` |
| Crear | `components/patients/PrescriptionModal.tsx` |
| Crear | `components/patients/PrescriptionsPanel.tsx` |
| Modificar | `app/(dashboard)/pacientes/[id]/page.tsx` |
| Modificar | `components/treatments/TreatmentPlanPanel.tsx` |
| Modificar | `app/(print)/pacientes/[id]/imprimir/page.tsx` |

---

## Task 1: Migración de base de datos — tabla `prescriptions`

**Files:**
- Create: `supabase/migrations/0028_prescriptions.sql`

Contexto: El proyecto usa Supabase con RLS multi-tenant. El helper `auth_clinic_id()` ya existe (definido en `0002_rls.sql`). Toda tabla con `clinic_id` debe activar RLS y crear una policy `tenant_isolation`.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/0028_prescriptions.sql
create table prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  doctor_id   uuid references profiles(id) on delete set null,
  medications jsonb not null default '[]'::jsonb,
  -- Cada elemento del array: { name: string, dosage: string, instructions: string }
  notes       text,
  issued_at   timestamptz not null default now()
);

create index idx_prescriptions_patient on prescriptions(patient_id);
create index idx_prescriptions_clinic  on prescriptions(clinic_id);

alter table prescriptions enable row level security;
create policy tenant_isolation on prescriptions
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
```

- [ ] **Step 2: Aplicar migración**

Ejecutar en el panel SQL de Supabase (Project → SQL Editor) o con Supabase CLI:

```bash
npx supabase db push
```

Verificar en Table Editor que la tabla `prescriptions` aparece con las columnas `id`, `clinic_id`, `patient_id`, `doctor_id`, `medications`, `notes`, `issued_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_prescriptions.sql
git commit -m "feat(db): tabla prescriptions con RLS tenant_isolation"
```

---

## Task 2: Server Action + validación pura + tests

**Files:**
- Create: `app/(dashboard)/pacientes/prescription-actions.ts`
- Create: `tests/prescription-actions.test.ts`

Contexto: Los Server Actions del proyecto siguen el patrón de `treatment-actions.ts`: `"use server"` → `getProfile()` → `can()` → Supabase insert → `revalidatePath()`. Las funciones puras exportadas pueden testearse con Vitest sin mocks.

- [ ] **Step 1: Escribir el test (primero — TDD)**

```typescript
// tests/prescription-actions.test.ts
import { describe, it, expect } from "vitest";
import {
  validateMedications,
  type Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";

describe("validateMedications", () => {
  it("error si la lista está vacía", () => {
    expect(validateMedications([])).toBe("Agrega al menos un medicamento.");
  });

  it("ok con medicamento nombre + dosis completos", () => {
    const meds: Medication[] = [
      { name: "Amoxicilina", dosage: "500mg", instructions: "1 cada 8h" },
    ];
    expect(validateMedications(meds)).toBeNull();
  });

  it("error si nombre está vacío (solo espacios)", () => {
    const meds: Medication[] = [{ name: "  ", dosage: "500mg", instructions: "" }];
    expect(validateMedications(meds)).toBe("El nombre del medicamento es requerido.");
  });

  it("error si dosis está vacía", () => {
    const meds: Medication[] = [{ name: "Ibuprofeno", dosage: "  ", instructions: "" }];
    expect(validateMedications(meds)).toBe("La dosis del medicamento es requerida.");
  });

  it("instructions es opcional — string vacío permitido", () => {
    const meds: Medication[] = [{ name: "Paracetamol", dosage: "1g", instructions: "" }];
    expect(validateMedications(meds)).toBeNull();
  });

  it("valida TODOS los items — detecta el segundo si el primero es válido", () => {
    const meds: Medication[] = [
      { name: "Amoxicilina", dosage: "500mg", instructions: "" },
      { name: "", dosage: "10mg", instructions: "" },
    ];
    expect(validateMedications(meds)).toBe("El nombre del medicamento es requerido.");
  });
});
```

- [ ] **Step 2: Verificar que el test falla**

```bash
npx vitest run tests/prescription-actions.test.ts
```

Esperado: FAIL con `Cannot find module '@/app/(dashboard)/pacientes/prescription-actions'`

- [ ] **Step 3: Crear el Server Action**

```typescript
// app/(dashboard)/pacientes/prescription-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type Medication = {
  name: string;
  dosage: string;
  instructions: string;
};

export type PrescriptionRow = {
  id: string;
  doctorName: string | null;
  medications: Medication[];
  notes: string | null;
  issuedAt: string; // ISO
};

export function validateMedications(meds: Medication[]): string | null {
  if (meds.length === 0) return "Agrega al menos un medicamento.";
  for (const m of meds) {
    if (!m.name.trim()) return "El nombre del medicamento es requerido.";
    if (!m.dosage.trim()) return "La dosis del medicamento es requerida.";
  }
  return null;
}

export async function createPrescription(
  patientId: string,
  medications: Medication[],
  notes: string,
): Promise<{ id: string } | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const validationError = validateMedications(medications);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prescriptions")
    .insert({
      clinic_id: profile.clinicId,
      patient_id: patientId,
      doctor_id: profile.userId,
      medications,
      notes: notes.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Error al guardar la receta." };

  revalidatePath(`/pacientes/${patientId}`);
  return { id: data.id };
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```bash
npx vitest run tests/prescription-actions.test.ts
```

Esperado: PASS — 6 tests passed.

- [ ] **Step 5: Verificar TypeScript sin errores**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/pacientes/prescription-actions.ts tests/prescription-actions.test.ts
git commit -m "feat(prescriptions): server action createPrescription + validación testeable"
```

---

## Task 3: Página de impresión de receta

**Files:**
- Create: `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx`

Contexto: Las páginas de impresión viven en el route group `(print)` que tiene un layout mínimo (`export default function PrintLayout({ children }) { return <>{children}</>; }`). La página renderiza en el browser sin sidebar. `AutoPrint` y `PrintButtons` ya existen en `app/(print)/pacientes/[id]/imprimir/AutoPrint.tsx`. La ruta pública será `/pacientes/[id]/receta/[recetaId]`.

- [ ] **Step 1: Crear la página de impresión**

```tsx
// app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoPrint, PrintButtons } from "../../imprimir/AutoPrint";
import type { Medication } from "@/app/(dashboard)/pacientes/prescription-actions";

const now = () =>
  new Date().toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export default async function RecetaPage({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();

  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, medications, notes, issued_at, doctor:profiles(full_name)")
    .eq("id", recetaId)
    .eq("patient_id", id)
    .single();
  if (!rx) notFound();

  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, national_id, clinic_id")
    .eq("id", id)
    .single();
  if (!patient) notFound();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", patient.clinic_id)
    .single();

  const medications = rx.medications as Medication[];
  const doctorName =
    (rx.doctor as { full_name?: string } | null)?.full_name ?? null;

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-8 text-slate-800">
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <p className="text-xl font-bold uppercase tracking-wide">
              {clinic?.name ?? "Clínica Dental"}
            </p>
            <p className="mt-1 text-sm font-semibold uppercase text-slate-500">
              Receta Médica
            </p>
            {doctorName && (
              <p className="mt-0.5 text-sm text-slate-600">
                Dr./Dra. {doctorName}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Fecha de emisión:</p>
            <p className="font-medium text-slate-700">{now()}</p>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 rounded-lg bg-slate-50 px-5 py-4 text-sm">
          <div>
            <span className="text-slate-500">Paciente: </span>
            <span className="font-semibold">{patient.full_name}</span>
          </div>
          <div>
            <span className="text-slate-500">CI: </span>
            <span className="font-semibold">{patient.national_id ?? "—"}</span>
          </div>
        </div>

        {/* Tabla de medicamentos */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase text-slate-500">
              <th className="pb-2 pr-3">#</th>
              <th className="pb-2 pr-3">Medicamento</th>
              <th className="pb-2 pr-3">Dosis</th>
              <th className="pb-2">Indicaciones</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((m, i) => (
              <tr
                key={i}
                className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-slate-50" : ""}`}
              >
                <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                <td className="py-2 pr-3 font-medium">{m.name}</td>
                <td className="py-2 pr-3 text-slate-600">{m.dosage}</td>
                <td className="py-2 text-slate-600">{m.instructions || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notas generales */}
        {rx.notes && (
          <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
              Notas / Indicaciones generales
            </p>
            <p className="text-slate-700">{rx.notes}</p>
          </div>
        )}

        {/* Firmas */}
        <div className="mt-16 grid grid-cols-2 gap-12 text-sm text-slate-500">
          <div className="border-t border-slate-400 pt-2 text-center">
            Firma del Odontólogo
          </div>
          <div className="border-t border-slate-400 pt-2 text-center">
            Firma del Paciente
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx"
git commit -m "feat(prescriptions): página de impresión de receta médica"
```

---

## Task 4: Modal de edición de receta (cliente)

**Files:**
- Create: `components/patients/PrescriptionModal.tsx`

Contexto: Componente `"use client"`. El usuario agrega filas de medicamentos dinámicamente. Al guardar llama `createPrescription` (Server Action) y abre la página de impresión en nueva pestaña con `window.open`. El patrón de modal del proyecto usa un `fixed inset-0 z-50` overlay.

- [ ] **Step 1: Crear el componente modal**

```tsx
// components/patients/PrescriptionModal.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPrescription,
  type Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";

const emptyMed = (): Medication => ({ name: "", dosage: "", instructions: "" });

export function PrescriptionModal({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateMed(idx: number, field: keyof Medication, value: string) {
    setMedications((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );
  }

  function addMed() {
    setMedications((prev) => [...prev, emptyMed()]);
  }

  function removeMed(idx: number) {
    setMedications((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createPrescription(patientId, medications, notes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
      window.open(`/pacientes/${patientId}/receta/${result.id}`, "_blank");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Emitir Receta</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            Agrega los medicamentos que deseas prescribir. Los campos marcados con * son obligatorios.
          </p>

          {medications.map((m, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
            >
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Medicamento *</span>
                <input
                  value={m.name}
                  onChange={(e) => updateMed(idx, "name", e.target.value)}
                  placeholder="Amoxicilina"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Dosis *</span>
                <input
                  value={m.dosage}
                  onChange={(e) => updateMed(idx, "dosage", e.target.value)}
                  placeholder="500mg c/8h"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-slate-500">Indicaciones</span>
                <input
                  value={m.instructions}
                  onChange={(e) => updateMed(idx, "instructions", e.target.value)}
                  placeholder="Con las comidas"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
                />
              </label>
              <button
                type="button"
                onClick={() => removeMed(idx)}
                disabled={medications.length === 1}
                title="Eliminar medicamento"
                className="pb-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addMed}
            className="mt-1 text-sm text-clinic hover:underline"
          >
            + Agregar medicamento
          </button>

          <label className="block text-xs mt-2">
            <span className="mb-1 block text-slate-500">
              Notas generales (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Evitar alcohol. Tomar con abundante agua..."
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar y generar receta"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/patients/PrescriptionModal.tsx
git commit -m "feat(prescriptions): modal editor de receta médica"
```

---

## Task 5: Panel de recetas (lista + botón emitir)

**Files:**
- Create: `components/patients/PrescriptionsPanel.tsx`

Contexto: Componente `"use client"` que lista las recetas del paciente y muestra el botón "Emitir Receta" si `canWrite`. Abre `PrescriptionModal` al hacer clic. Cada fila tiene un enlace "Ver / imprimir" que abre la página de impresión en nueva pestaña.

- [ ] **Step 1: Crear el panel**

```tsx
// components/patients/PrescriptionsPanel.tsx
"use client";

import { useState } from "react";
import { type PrescriptionRow } from "@/app/(dashboard)/pacientes/prescription-actions";
import { PrescriptionModal } from "./PrescriptionModal";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PrescriptionsPanel({
  patientId,
  prescriptions,
  canWrite,
}: {
  patientId: string;
  prescriptions: PrescriptionRow[];
  canWrite: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Emitir Receta
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[10rem_1fr_7rem_6rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Doctor</span>
          <span>Medicamentos</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr_7rem_6rem]"
            >
              <span className="tabular-nums text-slate-500">
                {fmtDateTime(rx.issuedAt)}
              </span>
              <span className="font-medium">
                {rx.doctorName ?? (
                  <span className="text-slate-300">—</span>
                )}
              </span>
              <span className="text-slate-500">
                {rx.medications.length}{" "}
                {rx.medications.length === 1 ? "med." : "meds."}
              </span>
              <div className="flex justify-end">
                <a
                  href={`/pacientes/${patientId}/receta/${rx.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-clinic hover:underline"
                >
                  Ver / imprimir
                </a>
              </div>
            </div>
          ))}
          {prescriptions.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Sin recetas emitidas.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <PrescriptionModal
          patientId={patientId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/patients/PrescriptionsPanel.tsx
git commit -m "feat(prescriptions): panel de recetas emitidas con botón Emitir Receta"
```

---

## Task 6: Integración en la ficha del paciente

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`

Contexto: La página ya hace 4 queries en paralelo con `Promise.all`. Se agrega una quinta para `prescriptions`. El mapeo sigue el mismo patrón que `paymentRows` y `apptRows`. Se agrega una nueva `<section>` al final del JSX.

- [ ] **Step 1: Leer el archivo actual**

Lee `app/(dashboard)/pacientes/[id]/page.tsx` para confirmar las líneas exactas antes de editar.

- [ ] **Step 2: Agregar imports**

Al principio del archivo, después de las importaciones existentes de componentes, agregar:

```typescript
import {
  PrescriptionsPanel,
} from "@/components/patients/PrescriptionsPanel";
import type {
  PrescriptionRow,
  Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";
```

- [ ] **Step 3: Agregar query de prescripciones al Promise.all**

Cambiar el `Promise.all` existente de 4 elementos a 5. El bloque actual es:

```typescript
const [{ data: rawPlans }, { data: payments }, { data: appointments }, { data: dentists }] = await Promise.all([
```

Reemplazar con:

```typescript
const [
  { data: rawPlans },
  { data: payments },
  { data: appointments },
  { data: dentists },
  { data: rawPrescriptions },
] = await Promise.all([
  // ... las 4 queries existentes sin cambios ...
  supabase
    .from("prescriptions")
    .select("id, medications, notes, issued_at, doctor:profiles(full_name)")
    .eq("patient_id", id)
    .order("issued_at", { ascending: false }),
]);
```

- [ ] **Step 4: Mapear prescripciones**

Después del bloque de mapeo de `paymentRows`, agregar:

```typescript
const prescriptionRows: PrescriptionRow[] = (rawPrescriptions ?? []).map((rx) => ({
  id: rx.id as string,
  doctorName:
    ((rx.doctor as { full_name?: string } | null)?.full_name) ?? null,
  medications: rx.medications as Medication[],
  notes: rx.notes as string | null,
  issuedAt: rx.issued_at as string,
}));
```

- [ ] **Step 5: Agregar sección al JSX**

Al final del JSX, después de la sección `"Historial de pagos del paciente"`, agregar:

```tsx
<section>
  <h2 className="mb-3 text-lg font-semibold">Recetas emitidas</h2>
  <PrescriptionsPanel
    patientId={patient.id}
    prescriptions={prescriptionRows}
    canWrite={canClinical}
  />
</section>
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(prescriptions): integrar panel de recetas en ficha del paciente"
```

---

## Task 7: Renombrar botón "Imprimir plan" → "Presupuesto" + actualizar título del documento

**Files:**
- Modify: `components/treatments/TreatmentPlanPanel.tsx`
- Modify: `app/(print)/pacientes/[id]/imprimir/page.tsx`

Contexto: Cambios puramente cosméticos. El botón ya existe en `TreatmentPlanPanel` con texto "Imprimir plan". La página de impresión tiene el subtítulo "Plan de Tratamiento". Solo se cambian las cadenas de texto, sin cambios de lógica o estructura.

- [ ] **Step 1: Renombrar botón en TreatmentPlanPanel**

En `components/treatments/TreatmentPlanPanel.tsx`, línea ~64, cambiar el texto del enlace:

```tsx
// ANTES:
  Imprimir plan

// DESPUÉS:
  Presupuesto
```

El enlace completo queda:
```tsx
<a
  href={`/pacientes/${patientId}/imprimir`}
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
  Presupuesto
</a>
```

- [ ] **Step 2: Actualizar título en la página de impresión**

En `app/(print)/pacientes/[id]/imprimir/page.tsx`, línea ~106, cambiar:

```tsx
// ANTES:
<p className="mt-1 text-sm font-semibold uppercase text-slate-500">
  Plan de Tratamiento
</p>

// DESPUÉS:
<p className="mt-1 text-sm font-semibold uppercase text-slate-500">
  Presupuesto de Tratamiento
</p>
```

- [ ] **Step 3: Verificar TypeScript y tests**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: sin errores de TypeScript, todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
git add components/treatments/TreatmentPlanPanel.tsx "app/(print)/pacientes/[id]/imprimir/page.tsx"
git commit -m "feat(presupuesto): renombrar botón 'Imprimir plan' a 'Presupuesto'"
```

---

## Verificación final

Después de todos los tasks, verificar manualmente en el browser:

1. Ir a la ficha de un paciente → ver sección "Recetas emitidas" al final.
2. Clic en "Emitir Receta" → aparece el modal con una fila de medicamentos.
3. Llenar nombre + dosis → clic "Guardar y generar receta" → se abre la receta en nueva pestaña con membrete y tabla.
4. La receta aparece en la lista de "Recetas emitidas" con fecha y botón "Ver / imprimir".
5. En la sección "Plan de tratamiento" → el botón dice "Presupuesto" → clic abre el documento con título "Presupuesto de Tratamiento".
