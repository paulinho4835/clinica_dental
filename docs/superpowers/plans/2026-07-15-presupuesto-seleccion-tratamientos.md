# Selección de tratamientos al imprimir presupuesto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que el admin elija, desde un modal, qué tratamientos incluir al imprimir el presupuesto de un paciente, en vez de imprimir siempre todo el historial.

**Architecture:** Un modal cliente (`PrintSelectModal`) reemplaza el enlace directo "Presupuesto" en `TreatmentPlanPanel`; al confirmar, abre `/pacientes/[id]/imprimir?items=id1,id2,...` en pestaña nueva. La página de impresión (server component) filtra tratamientos y recalcula el resumen financiero usando funciones puras nuevas en `lib/print/budgetSelection.ts`, testeadas con Vitest. Sin `?items=`, el comportamiento es idéntico al actual (compatibilidad con enlaces existentes).

**Tech Stack:** Next.js App Router (server component + client component), Vitest + @testing-library/react (jsdom) para tests.

## Global Constraints

- Español neutro en toda la UI (sin voseo): "elige", "marca", no "elegí", "marcá".
- Sin `?items=` en la URL, la página de impresión mantiene el comportamiento actual exacto (todos los tratamientos, todos los pagos) — no romper compatibilidad hacia atrás.
- Pagos sin `treatment_item_id` (no vinculados a un tratamiento puntual) se EXCLUYEN del "total pagado" cuando hay una selección activa (`?items=` presente).
- Reutilizar el componente `Modal` existente en `components/ui/Modal.tsx` — no crear un modal nuevo desde cero.
- El tipo `Work` ya existe en `components/treatments/TreatmentPlanPanel.tsx:17-25` (`{ id, name, price, done, createdAt, dentistId?, dentistName? }`) — reutilizarlo, no redefinirlo.

---

### Task 1: Funciones puras de filtrado y suma (`lib/print/budgetSelection.ts`)

**Files:**
- Create: `lib/print/budgetSelection.ts`
- Test: `tests/budgetSelection.test.ts`

**Interfaces:**
- Consumes: nada (funciones puras, sin dependencias externas).
- Produces:
  - `parseSelectedIds(raw: string | undefined): Set<string> | null` — `undefined` o string vacío → `null` (sin filtro); si no, `Set` con los IDs separados por coma, recortando espacios y descartando vacíos.
  - `filterBySelection<T extends { id: string }>(items: T[], selectedIds: Set<string> | null): T[]` — si `selectedIds` es `null`, devuelve `items` tal cual; si no, filtra a los que están en el set.
  - `sumPaymentsForSelection(payments: { amount: number; treatment_item_id: string | null }[], selectedIds: Set<string> | null): number` — si `selectedIds` es `null`, suma `amount` de todos los pagos (comportamiento actual); si no, suma solo los pagos cuyo `treatment_item_id` no es `null` y está en `selectedIds`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/budgetSelection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseSelectedIds,
  filterBySelection,
  sumPaymentsForSelection,
} from "@/lib/print/budgetSelection";

describe("parseSelectedIds", () => {
  it("undefined devuelve null (sin filtro)", () => {
    expect(parseSelectedIds(undefined)).toBeNull();
  });

  it("string vacío devuelve null (sin filtro)", () => {
    expect(parseSelectedIds("")).toBeNull();
  });

  it("parsea IDs separados por coma", () => {
    const result = parseSelectedIds("id1,id2,id3");
    expect(result).toEqual(new Set(["id1", "id2", "id3"]));
  });

  it("recorta espacios y descarta vacíos", () => {
    const result = parseSelectedIds(" id1 , , id2 ");
    expect(result).toEqual(new Set(["id1", "id2"]));
  });
});

describe("filterBySelection", () => {
  const items = [
    { id: "a", name: "Limpieza" },
    { id: "b", name: "Extracción" },
    { id: "c", name: "Corona" },
  ];

  it("sin selección (null) devuelve todos los items", () => {
    expect(filterBySelection(items, null)).toEqual(items);
  });

  it("con selección devuelve solo los IDs incluidos", () => {
    const result = filterBySelection(items, new Set(["a", "c"]));
    expect(result).toEqual([items[0], items[2]]);
  });

  it("selección vacía devuelve array vacío", () => {
    expect(filterBySelection(items, new Set())).toEqual([]);
  });
});

describe("sumPaymentsForSelection", () => {
  const payments = [
    { amount: 100, treatment_item_id: "a" },
    { amount: 50, treatment_item_id: "b" },
    { amount: 30, treatment_item_id: null },
  ];

  it("sin selección (null) suma todos los pagos, incluidos los sin vínculo", () => {
    expect(sumPaymentsForSelection(payments, null)).toBe(180);
  });

  it("con selección suma solo los pagos vinculados a esos IDs", () => {
    expect(sumPaymentsForSelection(payments, new Set(["a"]))).toBe(100);
  });

  it("con selección excluye pagos sin treatment_item_id aunque haya otros seleccionados", () => {
    expect(sumPaymentsForSelection(payments, new Set(["a", "b"]))).toBe(150);
  });

  it("selección que no matchea ningún pago devuelve 0", () => {
    expect(sumPaymentsForSelection(payments, new Set(["z"]))).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run tests/budgetSelection.test.ts`
Expected: FAIL — `Cannot find module '@/lib/print/budgetSelection'`

- [ ] **Step 3: Implementar las funciones**

Crear `lib/print/budgetSelection.ts`:

```typescript
export function parseSelectedIds(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(ids);
}

export function filterBySelection<T extends { id: string }>(
  items: T[],
  selectedIds: Set<string> | null,
): T[] {
  if (selectedIds === null) return items;
  return items.filter((item) => selectedIds.has(item.id));
}

export function sumPaymentsForSelection(
  payments: { amount: number; treatment_item_id: string | null }[],
  selectedIds: Set<string> | null,
): number {
  if (selectedIds === null) {
    return payments.reduce((s, p) => s + p.amount, 0);
  }
  return payments.reduce((s, p) => {
    if (p.treatment_item_id && selectedIds.has(p.treatment_item_id)) {
      return s + p.amount;
    }
    return s;
  }, 0);
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run tests/budgetSelection.test.ts`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/print/budgetSelection.ts tests/budgetSelection.test.ts
git commit -m "feat(presupuesto): funciones puras de filtrado y suma por selección"
```

---

### Task 2: Modal de selección (`components/treatments/PrintSelectModal.tsx`)

**Files:**
- Create: `components/treatments/PrintSelectModal.tsx`
- Test: `tests/printSelectModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` de `components/ui/Modal.tsx` (props `open`, `onClose`, `title`, `subtitle`, `children`, `size`); tipo `Work` y helper `bs` (de `@/lib/format`) ya usados en `TreatmentPlanPanel.tsx`.
- Produces: `PrintSelectModal({ patientId: string; works: Work[] }): JSX.Element` — componente cliente exportado, consumido por Task 3.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/printSelectModal.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintSelectModal } from "@/components/treatments/PrintSelectModal";
import type { Work } from "@/components/treatments/TreatmentPlanPanel";

const works: Work[] = [
  { id: "w1", name: "Limpieza", price: 100, done: true, createdAt: "2026-01-01T10:00:00" },
  { id: "w2", name: "Extracción", price: 250, done: false, createdAt: "2026-02-01T10:00:00" },
];

describe("PrintSelectModal", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  it("el botón 'Presupuesto' abre el modal con una fila por tratamiento", () => {
    render(<PrintSelectModal patientId="p1" works={works} />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    expect(screen.getByText("Limpieza")).toBeInTheDocument();
    expect(screen.getByText("Extracción")).toBeInTheDocument();
  });

  it("todos los checkboxes empiezan desmarcados y el botón Imprimir empieza deshabilitado", () => {
    render(<PrintSelectModal patientId="p1" works={works} />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
  });

  it("marcar un tratamiento habilita Imprimir y actualiza el total", () => {
    render(<PrintSelectModal patientId="p1" works={works} />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeEnabled();
    expect(screen.getByText("Bs 100.00")).toBeInTheDocument();
  });

  it("'Marcar todos' selecciona todos los checkboxes y suma el total completo", () => {
    render(<PrintSelectModal patientId="p1" works={works} />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getByText("Marcar todos"));
    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeChecked());
    expect(screen.getByText("Bs 350.00")).toBeInTheDocument();
  });

  it("Imprimir abre la URL con los IDs seleccionados separados por coma", () => {
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    render(<PrintSelectModal patientId="p1" works={works} />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(openSpy).toHaveBeenCalledWith(
      "/pacientes/p1/imprimir?items=w1,w2",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run tests/printSelectModal.test.tsx`
Expected: FAIL — `Cannot find module '@/components/treatments/PrintSelectModal'`

- [ ] **Step 3: Implementar el componente**

Crear `components/treatments/PrintSelectModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { bs, fmtBoliviaDateTime } from "@/lib/format";
import type { Work } from "./TreatmentPlanPanel";

export function PrintSelectModal({
  patientId,
  works,
}: {
  patientId: string;
  works: Work[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === works.length ? new Set() : new Set(works.map((w) => w.id)),
    );
  }

  function handlePrint() {
    const ids = Array.from(selected).join(",");
    window.open(`/pacientes/${patientId}/imprimir?items=${ids}`, "_blank", "noopener,noreferrer");
    setOpen(false);
    setSelected(new Set());
  }

  const total = works
    .filter((w) => selected.has(w.id))
    .reduce((s, w) => s + w.price, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Presupuesto
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Elegir tratamientos a imprimir"
        subtitle="Marca los tratamientos que quieres incluir en el presupuesto."
        size="lg"
      >
        <div className="mb-3 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={toggleAll}
            className="font-medium text-clinic hover:underline"
          >
            {selected.size === works.length ? "Desmarcar todos" : "Marcar todos"}
          </button>
          <span className="text-slate-500">
            Total seleccionado: <span className="font-semibold text-slate-800">{bs(total)}</span>
          </span>
        </div>

        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
          {works.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos en el plan.</p>
          )}
          {works.map((w) => (
            <label
              key={w.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(w.id)}
                onChange={() => toggle(w.id)}
                className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
              />
              <span className="w-28 shrink-0 text-xs tabular-nums text-slate-400">
                {fmtBoliviaDateTime(w.createdAt)}
              </span>
              <span className="flex-1 font-medium">{w.name}</span>
              <span className="tabular-nums text-slate-600">{bs(w.price)}</span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={handlePrint}
            className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Imprimir
          </button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run tests/printSelectModal.test.tsx`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add components/treatments/PrintSelectModal.tsx tests/printSelectModal.test.tsx
git commit -m "feat(presupuesto): modal de selección de tratamientos a imprimir"
```

---

### Task 3: Cablear el modal en `TreatmentPlanPanel`

**Files:**
- Modify: `components/treatments/TreatmentPlanPanel.tsx:1-72`

**Interfaces:**
- Consumes: `PrintSelectModal` de Task 2 (`{ patientId: string; works: Work[] }`).
- Produces: nada nuevo — `TreatmentPlanPanel` sigue exportando lo mismo que antes.

- [ ] **Step 1: Reemplazar el import y el bloque del enlace**

En `components/treatments/TreatmentPlanPanel.tsx`, agregar el import junto a los existentes (línea 9, después del import de `treatment-actions`):

```typescript
import { PrintSelectModal } from "./PrintSelectModal";
```

Reemplazar el bloque completo (líneas 56-72):

```tsx
      {recetasEnabled && (
        <div className="flex items-center justify-end">
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
        </div>
      )}
```

por:

```tsx
      {recetasEnabled && (
        <div className="flex items-center justify-end">
          <PrintSelectModal patientId={patientId} works={works} />
        </div>
      )}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `TreatmentPlanPanel.tsx` o `PrintSelectModal.tsx`.

- [ ] **Step 3: Correr toda la suite de tests para confirmar que nada se rompió**

Run: `npx vitest run`
Expected: PASS — todos los tests existentes siguen pasando, más los 14 nuevos de las Tasks 1 y 2.

- [ ] **Step 4: Commit**

```bash
git add components/treatments/TreatmentPlanPanel.tsx
git commit -m "feat(presupuesto): usar el modal de selección en vez del enlace directo"
```

---

### Task 4: Filtrar la página de impresión por `?items=`

**Files:**
- Modify: `app/(print)/pacientes/[id]/imprimir/page.tsx:29-85`

**Interfaces:**
- Consumes: `parseSelectedIds`, `filterBySelection`, `sumPaymentsForSelection` de `lib/print/budgetSelection.ts` (Task 1).
- Produces: nada nuevo — sigue siendo la misma página, ahora aceptando `searchParams`.

- [ ] **Step 1: Actualizar la firma del componente y la query de `payments`**

En `app/(print)/pacientes/[id]/imprimir/page.tsx`, agregar el import (junto a los existentes, línea 6):

```typescript
import {
  parseSelectedIds,
  filterBySelection,
  sumPaymentsForSelection,
} from "@/lib/print/budgetSelection";
```

Reemplazar la firma de la función (líneas 29-33):

```typescript
export default async function ImprimirPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ items?: string }>;
}) {
  const { id } = await params;
  const { items } = await searchParams;
  const selectedIds = parseSelectedIds(items);
  const supabase = await createClient();
```

Modificar el `select` de `payments` (línea 61, dentro del `Promise.all`) para incluir `treatment_item_id`:

```typescript
      supabase
        .from("payments")
        .select("amount, treatment_item_id")
        .eq("patient_id", id),
```

- [ ] **Step 2: Filtrar `works` y recalcular los totales**

Reemplazar el bloque de cálculo de `works` y totales (líneas 65-85):

```typescript
  const allWorks = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .map((it) => ({
      id: it.id as string,
      name:
        ((it.procedure as { name?: string } | null)?.name ??
          (it.custom_name as string)) || "—",
      price: Number(it.price),
      done: it.status === "done",
      createdAt: it.created_at as string,
      dentistName:
        ((it.doctor as { full_name?: string } | null)?.full_name) ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const works = filterBySelection(allWorks, selectedIds);

  const logoUrl = await getClinicLogoUrl(patient.clinic_id);

  const totalQuoted = works.reduce((s, w) => s + w.price, 0);
  const totalPaid = sumPaymentsForSelection(payments ?? [], selectedIds);
  const saldo = totalQuoted - totalPaid;
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación manual en el navegador**

Iniciar el servidor de desarrollo:

Run: `npm run dev`

En el navegador:
1. Ir a la ficha de un paciente con al menos 2 tratamientos registrados, abrir el panel de Tratamientos.
2. Clic en "Presupuesto" → debe abrirse el modal con checkboxes desmarcados y el botón "Imprimir" deshabilitado.
3. Marcar 1 tratamiento → el total del modal debe reflejar solo su precio, y "Imprimir" debe habilitarse.
4. Clic en "Imprimir" → debe abrirse una pestaña nueva en `/pacientes/{id}/imprimir?items={id}` mostrando SOLO ese tratamiento en la tabla, y el resumen financiero (cotizado/pagado/saldo) recalculado sobre ese único tratamiento.
5. Volver a la ficha, abrir `/pacientes/{id}/imprimir` directamente (sin `?items=`, pegando la URL a mano) → debe mostrar TODOS los tratamientos y pagos, igual que antes del cambio.

Expected: los 5 pasos se comportan como se describe, sin errores en la consola del navegador.

- [ ] **Step 5: Commit**

```bash
git add "app/(print)/pacientes/[id]/imprimir/page.tsx"
git commit -m "feat(presupuesto): filtrar tratamientos y totales por selección en la impresión"
```

---

## Self-Review

**Cobertura del spec:**
- Modal de selección con checkboxes desmarcados por defecto → Task 2.
- Botón "Presupuesto" abre el modal en vez de imprimir directo → Task 3.
- Página de impresión filtra por `?items=` → Task 4.
- Resumen financiero recalculado solo sobre lo seleccionado, incluyendo exclusión de pagos sin `treatment_item_id` → Task 1 (`sumPaymentsForSelection`) + Task 4.
- Compatibilidad hacia atrás sin `?items=` → Task 1 (`parseSelectedIds` devuelve `null` → `filterBySelection`/`sumPaymentsForSelection` devuelven el comportamiento actual) + Task 4.

**Placeholders:** ninguno — todos los pasos tienen código completo.

**Consistencia de tipos:** `Work` se usa igual en Tasks 2 y 3 (importado desde `TreatmentPlanPanel.tsx`, no redefinido). `parseSelectedIds`/`filterBySelection`/`sumPaymentsForSelection` se definen en Task 1 y se consumen sin cambios de firma en Task 4.
