# Agenda Redesign — Google Calendar Style v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la agenda con color por doctor (Google Calendar style), drag-and-drop optimista, tipografía jerárquica y micro-animaciones CSS.

**Architecture:** Se crean dos módulos puros (`lib/agenda/doctorColor.ts`, `lib/agenda/dragDrop.ts`) que no tienen JSX ni estado de UI, para que sean fácilmente testeables. Los tres componentes de vista (WeekView, DayView, MonthView) se modifican para consumirlos. La matemática de posicionamiento existente (`lib/agenda.ts`) no se toca.

**Tech Stack:** Next.js App Router, React 18 pointer events nativos, Tailwind CSS, Vitest + Testing Library, TypeScript strict.

---

## Archivos a crear / modificar

| Archivo | Acción |
|---------|--------|
| `lib/agenda/doctorColor.ts` | Crear — hash id→color, función pura |
| `lib/agenda/dragDrop.ts` | Crear — hook `useDrag()` |
| `tests/doctorColor.test.ts` | Crear — unit tests de color |
| `tests/dragDrop.test.ts` | Crear — unit tests de snap + optimistic |
| `components/agenda/apptHelpers.ts` | Modificar — agregar `apptBlockClass(status)` |
| `components/agenda/MonthView.tsx` | Modificar — pastillas de nombre |
| `components/agenda/WeekView.tsx` | Modificar — color por doctor + drag |
| `components/agenda/DayView.tsx` | Modificar — color por doctor + drag + create |

---

## Task 1: Módulo `doctorColor` — función pura + tests

**Files:**
- Create: `lib/agenda/doctorColor.ts`
- Create: `tests/doctorColor.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/doctorColor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDoctorColor, DOCTOR_PALETTE } from "@/lib/agenda/doctorColor";

describe("getDoctorColor", () => {
  it("devuelve objeto con bg, border, text para cualquier id", () => {
    const c = getDoctorColor("abc123");
    expect(c).toHaveProperty("bg");
    expect(c).toHaveProperty("border");
    expect(c).toHaveProperty("text");
  });

  it("el mismo id siempre devuelve el mismo color (determinístico)", () => {
    expect(getDoctorColor("doc-1")).toEqual(getDoctorColor("doc-1"));
  });

  it("ids distintos pueden dar distintos colores", () => {
    // Con 8 colores y 2 ids que caigan en índices distintos, los colores difieren.
    // Usamos los primeros 8 ids consecutivos para asegurar cobertura total.
    const colors = Array.from({ length: 8 }, (_, i) =>
      getDoctorColor(`test-doc-${i}`)
    );
    const unique = new Set(colors.map((c) => c.bg));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("id vacío o null-ish no lanza — devuelve color slate (sin asignar)", () => {
    expect(() => getDoctorColor("")).not.toThrow();
    const c = getDoctorColor("");
    expect(c.bg).toBe("bg-slate-100");
  });

  it("la paleta tiene exactamente 8 entradas", () => {
    expect(DOCTOR_PALETTE).toHaveLength(8);
  });

  it("ninguna entrada de la paleta tiene campos vacíos", () => {
    for (const entry of DOCTOR_PALETTE) {
      expect(entry.bg).toBeTruthy();
      expect(entry.border).toBeTruthy();
      expect(entry.text).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```
npx vitest run tests/doctorColor.test.ts
```

Resultado esperado: FAIL — "Cannot find module '@/lib/agenda/doctorColor'"

- [ ] **Step 3: Implementar `lib/agenda/doctorColor.ts`**

```ts
export type DoctorColor = {
  bg: string;      // Tailwind bg class  e.g. "bg-teal-50"
  border: string;  // Tailwind border-color class  e.g. "border-teal-500"
  text: string;    // Tailwind text class  e.g. "text-teal-800"
};

export const DOCTOR_PALETTE: DoctorColor[] = [
  { bg: "bg-teal-50",   border: "border-teal-500",   text: "text-teal-800"   }, // #0ea5a4
  { bg: "bg-indigo-50", border: "border-indigo-500",  text: "text-indigo-800" }, // #6366f1
  { bg: "bg-pink-50",   border: "border-pink-500",    text: "text-pink-800"   }, // #ec4899
  { bg: "bg-amber-50",  border: "border-amber-500",   text: "text-amber-800"  }, // #f59e0b
  { bg: "bg-emerald-50",border: "border-emerald-500", text: "text-emerald-800"}, // #10b981
  { bg: "bg-violet-50", border: "border-violet-500",  text: "text-violet-800" }, // #8b5cf6
  { bg: "bg-red-50",    border: "border-red-500",     text: "text-red-800"    }, // #ef4444
  { bg: "bg-sky-50",    border: "border-sky-500",     text: "text-sky-800"    }, // #0284c7
];

const UNASSIGNED: DoctorColor = {
  bg: "bg-slate-100",
  border: "border-slate-300",
  text: "text-slate-500",
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDoctorColor(doctorId: string): DoctorColor {
  if (!doctorId) return UNASSIGNED;
  return DOCTOR_PALETTE[hashStr(doctorId) % DOCTOR_PALETTE.length];
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```
npx vitest run tests/doctorColor.test.ts
```

Resultado esperado: PASS — 6 tests

- [ ] **Step 5: Verificar que los tests existentes siguen verdes**

```
npx vitest run
```

Resultado esperado: todos los tests anteriores pasan (sin regresiones)

- [ ] **Step 6: Commit**

```
git add lib/agenda/doctorColor.ts tests/doctorColor.test.ts
git commit -m "feat(agenda): getDoctorColor — hash determinístico doctor→color"
```

---

## Task 2: Actualizar `apptHelpers.ts` — canal de estado separado

**Files:**
- Modify: `components/agenda/apptHelpers.ts`

Este task reemplaza `apptBlockStyle(status)` (que mezcla color con estado) por `apptBlockClass(status)` que solo maneja el canal de estado. El color base del bloque ahora viene de `getDoctorColor`.

- [ ] **Step 1: Agregar `apptBlockClass` al final de `components/agenda/apptHelpers.ts`**

Agregar después de `apptBlockStyle`:

```ts
// Canal de estado puro — sin color de fondo (el color viene del doctor).
// Devuelve clases extra que se aplican sobre el color base del doctor.
export function apptBlockClass(status: string): string {
  if (status === "no_show")
    return "opacity-70 border-dashed !border-slate-300 !bg-slate-100 !text-slate-400";
  if (status === "in_chair")
    return "ring-2 ring-offset-0 animate-pulse-ring";
  // scheduled o finished: solo ajuste de opacidad del texto
  return "";
}

// Indica si se debe mostrar el check ✓ de "atendido".
export const isFinished = (status: string) => status === "finished";
```

- [ ] **Step 2: Correr los tests**

```
npx vitest run
```

Resultado esperado: PASS — no se rompió nada (las funciones viejas siguen existiendo)

- [ ] **Step 3: Agregar `animate-pulse-ring` a `tailwind.config.ts`**

Leer `tailwind.config.ts` primero. Agregar dentro del bloque `theme.extend.keyframes`:

```ts
"pulse-ring": {
  "0%, 100%": { boxShadow: "0 0 0 2px currentColor, 0 0 8px rgba(0,0,0,.2)" },
  "50%":       { boxShadow: "0 0 0 4px currentColor, 0 0 16px rgba(0,0,0,.35)" },
},
```

Y dentro de `theme.extend.animation`:

```ts
"pulse-ring": "pulse-ring 1.5s ease-in-out infinite",
```

- [ ] **Step 4: Commit**

```
git add components/agenda/apptHelpers.ts tailwind.config.ts
git commit -m "feat(agenda): apptBlockClass — canal de estado separado del color"
```

---

## Task 3: Módulo `dragDrop` — hook `useDrag` + tests

**Files:**
- Create: `lib/agenda/dragDrop.ts`
- Create: `tests/dragDrop.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/dragDrop.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { snapToSlot, applyOptimisticMove, revertMove } from "@/lib/agenda/dragDrop";
import { OPEN_HOUR, CLOSE_HOUR } from "@/lib/agenda";

const PX_PER_HOUR = 56;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;

describe("snapToSlot", () => {
  it("y=0 mapea a OPEN_HOUR:00", () => {
    const result = snapToSlot(0, AXIS_H, "2026-06-10");
    expect(result.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("snappea a incrementos de 15 minutos", () => {
    // 1h desde apertura = 56px exactos => 09:00
    const r1 = snapToSlot(PX_PER_HOUR, AXIS_H, "2026-06-10");
    expect(r1.time).toBe(`${String(OPEN_HOUR + 1).padStart(2,"0")}:00`);

    // 7px dentro del primer slot (15min = 14px) → redondea a 08:00
    const r2 = snapToSlot(7, AXIS_H, "2026-06-10");
    expect(r2.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("no puede ir por debajo de OPEN_HOUR", () => {
    const r = snapToSlot(-100, AXIS_H, "2026-06-10");
    expect(r.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("no puede superar CLOSE_HOUR - 15min", () => {
    const r = snapToSlot(AXIS_H + 999, AXIS_H, "2026-06-10");
    // el último slot válido es 19:45
    expect(r.time).toBe("19:45");
  });

  it("devuelve la fecha correcta", () => {
    const r = snapToSlot(0, AXIS_H, "2026-06-10");
    expect(r.date).toBe("2026-06-10");
  });
});

describe("applyOptimisticMove + revertMove", () => {
  const makeAppt = (id: string, starts: string, ends: string) => ({
    id,
    starts_at: starts,
    ends_at: ends,
    status: "scheduled",
    dentist_name: null,
    patient_id: null,
    patient_name: "Test",
    reason: null,
    consult_price: null,
    deposit: null,
    deposit_method: null,
    patients: null,
  });

  it("applyOptimisticMove mueve la cita correcta y preserva la duración", () => {
    const appts = [
      makeAppt("a1", "2026-06-10T09:00:00", "2026-06-10T10:00:00"),
      makeAppt("a2", "2026-06-10T11:00:00", "2026-06-10T12:00:00"),
    ];
    const result = applyOptimisticMove(appts, "a1", "2026-06-10", "10:00");
    const moved = result.find((a) => a.id === "a1")!;
    expect(moved.starts_at).toContain("T10:00");
    expect(moved.ends_at).toContain("T11:00"); // 1h de duración preservada
    // a2 no cambia
    expect(result.find((a) => a.id === "a2")!.starts_at).toBe(
      "2026-06-10T11:00:00"
    );
  });

  it("revertMove restaura el estado original exacto", () => {
    const original = [
      makeAppt("a1", "2026-06-10T09:00:00", "2026-06-10T10:00:00"),
    ];
    const moved = applyOptimisticMove(original, "a1", "2026-06-10", "11:00");
    const reverted = revertMove(moved, original);
    expect(reverted.find((a) => a.id === "a1")!.starts_at).toBe(
      "2026-06-10T09:00:00"
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```
npx vitest run tests/dragDrop.test.ts
```

Resultado esperado: FAIL — "Cannot find module '@/lib/agenda/dragDrop'"

- [ ] **Step 3: Implementar `lib/agenda/dragDrop.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import { OPEN_HOUR, CLOSE_HOUR, type TimeAppt } from "@/lib/agenda";

const STEP_MIN_DRAG = 15;
const pad = (n: number) => String(n).padStart(2, "0");

// ─── Lógica pura (testeable sin React) ────────────────────────────────────────

export type SlotTarget = { date: string; time: string };

/** Convierte una posición Y en píxeles al slot de 15min más cercano. */
export function snapToSlot(y: number, axisH: number, date: string): SlotTarget {
  const totalMin = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const rawMin = (Math.max(0, Math.min(axisH, y)) / axisH) * totalMin;
  const snapped = Math.round(rawMin / STEP_MIN_DRAG) * STEP_MIN_DRAG;
  const clamped = Math.min(snapped, totalMin - STEP_MIN_DRAG);
  const absMin = clamped + OPEN_HOUR * 60;
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return { date, time: `${pad(h)}:${pad(m)}` };
}

/** Aplica mutación optimista: mueve la cita `id` al slot destino preservando duración. */
export function applyOptimisticMove<T extends TimeAppt>(
  appts: T[],
  id: string,
  date: string,
  time: string,
): T[] {
  return appts.map((a) => {
    if (a.id !== id) return a;
    const oldStart = new Date(a.starts_at);
    const oldEnd = a.ends_at ? new Date(a.ends_at) : new Date(oldStart.getTime() + 30 * 60_000);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const [h, m] = time.split(":").map(Number);
    const [y, mo, d] = date.split("-").map(Number);
    const newStart = new Date(y, mo - 1, d, h, m);
    const newEnd = new Date(newStart.getTime() + durationMs);
    return {
      ...a,
      starts_at: `${date}T${pad(h)}:${pad(m)}:00`,
      ends_at: `${date}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}:00`,
    };
  });
}

/** Revierte al estado original (para el caso de error de servidor). */
export function revertMove<T extends TimeAppt>(current: T[], original: T[]): T[] {
  const map = new Map(original.map((a) => [a.id, a]));
  return current.map((a) => map.get(a.id) ?? a);
}

// ─── Hook React ───────────────────────────────────────────────────────────────

export interface UseDragOptions {
  /** Píxeles totales del eje de horas */
  axisH: number;
  /** YYYY-MM-DD del día visible */
  day: string;
  /** Callback cuando el drag termina con éxito: debe llamar al API y luego a onCommit */
  onDrop: (apptId: string, slot: SlotTarget) => void;
}

export interface UseDragReturn {
  draggingId: string | null;
  ghostSlot: SlotTarget | null;
  dragHandlers: (apptId: string) => {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
  };
  isDragging: (apptId: string) => boolean;
}

export function useDrag({ axisH, day, onDrop }: UseDragOptions): UseDragReturn {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostSlot, setGhostSlot] = useState<SlotTarget | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const offsetYRef = useRef(0);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top - offsetYRef.current;
      setGhostSlot(snapToSlot(y, axisH, day));
    },
    [axisH, day],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      e.currentTarget?.removeEventListener("pointermove", handlePointerMove);
      e.currentTarget?.removeEventListener("pointerup", handlePointerUp as EventListener);
      (e.currentTarget as HTMLElement | null)?.releasePointerCapture(e.pointerId);
      if (draggingId && ghostSlot) {
        onDrop(draggingId, ghostSlot);
      }
      setDraggingId(null);
      setGhostSlot(null);
    },
    [draggingId, ghostSlot, handlePointerMove, onDrop],
  );

  const dragHandlers = useCallback(
    (apptId: string) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        containerRef.current = e.currentTarget.closest<HTMLElement>("[data-agenda-col]");
        offsetYRef.current = e.nativeEvent.offsetY;
        setDraggingId(apptId);
        setGhostSlot(snapToSlot(e.nativeEvent.offsetY, axisH, day));
        e.currentTarget.addEventListener("pointermove", handlePointerMove);
        e.currentTarget.addEventListener("pointerup", handlePointerUp as EventListener);
      },
    }),
    [axisH, day, handlePointerMove, handlePointerUp],
  );

  const isDragging = useCallback(
    (apptId: string) => draggingId === apptId,
    [draggingId],
  );

  return { draggingId, ghostSlot, dragHandlers, isDragging };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```
npx vitest run tests/dragDrop.test.ts
```

Resultado esperado: PASS — 6 tests

- [ ] **Step 5: Verificar suite completa**

```
npx vitest run
```

Resultado esperado: todos los tests en verde

- [ ] **Step 6: Verificar TypeScript**

```
npx tsc --noEmit
```

Resultado esperado: 0 errores

- [ ] **Step 7: Commit**

```
git add lib/agenda/dragDrop.ts tests/dragDrop.test.ts
git commit -m "feat(agenda): useDrag hook con snapToSlot y mutación optimista"
```

---

## Task 4: MonthView — pastillas de nombre

**Files:**
- Modify: `components/agenda/MonthView.tsx`
- Modify: `components/agenda/apptHelpers.ts` (importar getDoctorColor)

El objetivo: reemplazar el badge contador `"3 citas"` por hasta 2 pastillas con nombre truncado + puntito de color del doctor, más `"+N más"` si sobran.

- [ ] **Step 1: Reemplazar el bloque de citas en `MonthView.tsx`**

Localizar y reemplazar este bloque (líneas 69–85 aproximadamente):

```tsx
// ANTES:
{inMonth && dayAppts.length > 0 && (
  <div className="flex flex-col gap-0.5">
    <span className="rounded bg-clinic/10 px-1.5 py-0.5 text-[11px] font-medium text-clinic">
      {dayAppts.length} cita{dayAppts.length > 1 ? "s" : ""}
    </span>
    <div className="flex gap-0.5">
      {dayAppts.some((a) => a.status === "finished") && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Atendidos" />
      )}
      {dayAppts.some((a) => a.status === "scheduled") && (
        <span className="h-1.5 w-1.5 rounded-full bg-clinic" title="Pendientes" />
      )}
```

```tsx
// DESPUÉS — reemplazar con:
{inMonth && dayAppts.length > 0 && (
  <div className="flex w-full flex-col gap-0.5">
    {dayAppts.slice(0, 2).map((a) => {
      const col = getDoctorColor(a.dentist_name ?? "");
      const name = a.patients?.full_name ?? a.patient_name ?? "Cita";
      return (
        <div
          key={a.id}
          className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium ${col.bg} ${col.text}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${col.border.replace("border-", "bg-")}`} />
          <span className="truncate">{name}</span>
        </div>
      );
    })}
    {dayAppts.length > 2 && (
      <span className="pl-1 text-[10px] text-slate-400">
        +{dayAppts.length - 2} más
      </span>
    )}
  </div>
```

- [ ] **Step 2: Agregar el import de `getDoctorColor` en `MonthView.tsx`**

Al inicio del archivo, agregar:

```tsx
import { getDoctorColor } from "@/lib/agenda/doctorColor";
```

- [ ] **Step 3: Eliminar los dots de estado que ya no se usan**

Localizar y eliminar el cierre del bloque viejo (los `</div>` extras y la línea de dots de `no_show` si existe). El nuevo bloque ya reemplaza todo.

- [ ] **Step 4: Correr TypeScript y tests**

```
npx tsc --noEmit && npx vitest run
```

Resultado esperado: 0 errores TypeScript, todos los tests en verde

- [ ] **Step 5: Commit**

```
git add components/agenda/MonthView.tsx
git commit -m "feat(agenda): MonthView muestra pastillas nombre+color en lugar de badge contador"
```

---

## Task 5: WeekView — color por doctor + drag para mover

**Files:**
- Modify: `components/agenda/WeekView.tsx`

Cambios:
1. Cada bloque usa `getDoctorColor(a.dentist_name ?? "")` en lugar de `apptBlockStyle(a.status)`.
2. Canal de estado con `apptBlockClass(a.status)`.
3. Integrar `useDrag()` para mover dentro del mismo día.
4. Mostrar ghost slot durante el drag.
5. Puntito de color del doctor en el encabezado de cada columna de día.

- [ ] **Step 1: Actualizar los imports en `WeekView.tsx`**

Reemplazar la línea de imports de helpers:

```tsx
// ANTES:
import { type MonthAppt, apptName, apptBlockStyle } from "./apptHelpers";

// DESPUÉS:
import { type MonthAppt, apptName, apptBlockClass } from "./apptHelpers";
import { getDoctorColor } from "@/lib/agenda/doctorColor";
import { useDrag, applyOptimisticMove, revertMove } from "@/lib/agenda/dragDrop";
```

- [ ] **Step 2: Agregar estado optimista y el hook `useDrag` dentro de la función `WeekView`**

Agregar `useState` al import de React y agregar al inicio del cuerpo del componente (antes del `return`):

```tsx
import { useMemo, useState, useCallback } from "react";
```

Dentro del componente, justo antes del `return`:

```tsx
const [localAppts, setLocalAppts] = useState<MonthAppt[]>([]);

// byDay con mutaciones optimistas aplicadas
const localByDay = useMemo(() => {
  if (localAppts.length === 0) return byDay;
  const merged = new Map(byDay);
  // Recalcular solo los días afectados
  for (const [k, arr] of byDay) {
    merged.set(
      k,
      arr.map((a) => localAppts.find((l) => l.id === a.id) ?? a),
    );
  }
  return merged;
}, [byDay, localAppts]);

const handleDrop = useCallback(
  async (apptId: string, slot: { date: string; time: string }) => {
    const allAppts = [...byDay.values()].flat();
    const original = allAppts.find((a) => a.id === apptId);
    if (!original) return;
    // Mutación optimista
    const updated = applyOptimisticMove(allAppts, apptId, slot.date, slot.time);
    setLocalAppts(updated);
    try {
      const res = await fetch(`/api/appointments/${apptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starts_at: updated.find((a) => a.id === apptId)!.starts_at,
          ends_at: updated.find((a) => a.id === apptId)!.ends_at,
        }),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      setLocalAppts(revertMove(updated, allAppts));
    }
  },
  [byDay],
);
```

- [ ] **Step 3: Inicializar un `useDrag` por día en el render**

Dentro del `.map((d, idx) => {...})` de los 7 días, al inicio de cada día:

```tsx
// eslint-disable-next-line react-hooks/rules-of-hooks
const { draggingId, ghostSlot, dragHandlers, isDragging } = useDrag({
  axisH: AXIS_H,
  day: k,
  onDrop: handleDrop,
});
```

> Nota: llamar hooks dentro de un `.map()` viola las reglas de React en general, pero es seguro cuando el array es de longitud fija (siempre 7 días). Alternativamente, extraer cada columna a un sub-componente `DayColumn` — pero para v1 el enfoque inline es más simple.

**Mejor enfoque para v1 — un solo `useDrag` a nivel de `WeekView`:**

Reemplazar lo de arriba con un único hook en el nivel del componente:

```tsx
const activeDay = useRef<string>("");
const { draggingId, ghostSlot, dragHandlers, isDragging } = useDrag({
  axisH: AXIS_H,
  day: activeDay.current,
  onDrop: handleDrop,
});
```

Y en el `onPointerDown` de cada bloque, setear `activeDay.current = k` antes de delegar al handler.

- [ ] **Step 4: Actualizar los bloques de cita para usar el nuevo sistema de color**

Dentro del `.map` de `laid.map(({ appt: a, ... })`:

```tsx
// ANTES:
className={`absolute z-10 overflow-hidden rounded border px-1 text-left text-[10px] leading-tight transition enabled:hover:shadow-md disabled:cursor-default ${apptBlockStyle(a.status)}`}

// DESPUÉS:
const col = getDoctorColor(a.dentist_name ?? "");
// ...
className={`absolute z-10 overflow-hidden rounded border-l-4 px-1 text-left text-[10px] leading-tight transition ${col.bg} ${col.border} ${col.text} ${apptBlockClass(a.status)} ${isDragging(a.id) ? "scale-105 shadow-lg opacity-90 z-20" : "hover:shadow-md"} ${canWrite ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
```

Agregar `{...dragHandlers(a.id)}` al botón si `canWrite`.

- [ ] **Step 5: Agregar ghost slot visual**

Dentro del contenedor de cada columna, después de los slots clicables y antes de los bloques de cita:

```tsx
{ghostSlot && ghostSlot.date === k && (() => {
  const [gh, gm] = ghostSlot.time.split(":").map(Number);
  const gDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), gh, gm);
  const gEnd = new Date(gDate.getTime() + 30 * 60_000);
  const gg = blockGeometry(gDate, gEnd);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 animate-ghost-pulse rounded border-2 border-dashed border-clinic bg-clinic/20"
      style={{ top: gg.top * AXIS_H, height: Math.max(gg.height * AXIS_H, 20) }}
    />
  );
})()}
```

- [ ] **Step 6: Agregar `animate-ghost-pulse` a `tailwind.config.ts`**

Dentro de `theme.extend.keyframes`:

```ts
"ghost-pulse": {
  "0%, 100%": { opacity: "0.35" },
  "50%":       { opacity: "0.65" },
},
```

Dentro de `theme.extend.animation`:

```ts
"ghost-pulse": "ghost-pulse 1.2s ease-in-out infinite",
```

- [ ] **Step 7: TypeScript y tests**

```
npx tsc --noEmit && npx vitest run
```

Resultado esperado: 0 errores, todos los tests pasan

- [ ] **Step 8: Commit**

```
git add components/agenda/WeekView.tsx tailwind.config.ts
git commit -m "feat(agenda): WeekView — color por doctor + drag para mover"
```

---

## Task 6: DayView — color por doctor + drag + clic-arrastre para crear

**Files:**
- Modify: `components/agenda/DayView.tsx`

Cambios:
1. Mismo sistema de color que WeekView.
2. `useDrag` para mover citas.
3. Clic-arrastre en slot vacío → llama a `onPick(start, end, col)` con hora pre-calculada.
4. Mostrar motivo + CI cuando bloque es `tall` (ya existe, se mantiene).
5. Estado `in_chair` con `animate-pulse-ring`.

- [ ] **Step 1: Actualizar imports en `DayView.tsx`**

```tsx
// ANTES:
import {
  type MonthAppt,
  apptName,
  apptCI,
  isQuickConsult,
  apptBlockStyle,
} from "./apptHelpers";

// DESPUÉS:
import {
  type MonthAppt,
  apptName,
  apptCI,
  isQuickConsult,
  apptBlockClass,
  isFinished,
} from "./apptHelpers";
import { getDoctorColor } from "@/lib/agenda/doctorColor";
import { useDrag, applyOptimisticMove, revertMove } from "@/lib/agenda/dragDrop";
```

Agregar `useCallback, useRef` al import de React.

- [ ] **Step 2: Agregar estado optimista y `useDrag` en `DayView`**

Justo antes del `return`, después de los `useMemo` existentes:

```tsx
const [localAppts, setLocalAppts] = useState<MonthAppt[]>(appts);

// Sincronizar si cambia la prop
useEffect(() => {
  setLocalAppts(appts);
}, [appts]);

const handleDrop = useCallback(
  async (apptId: string, slot: { date: string; time: string }) => {
    const original = appts.find((a) => a.id === apptId);
    if (!original) return;
    const updated = applyOptimisticMove(appts, apptId, slot.date, slot.time);
    setLocalAppts(updated);
    try {
      const moved = updated.find((a) => a.id === apptId)!;
      const res = await fetch(`/api/appointments/${apptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts_at: moved.starts_at, ends_at: moved.ends_at }),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      setLocalAppts(revertMove(updated, appts));
    }
  },
  [appts],
);

const { draggingId, ghostSlot, dragHandlers, isDragging } = useDrag({
  axisH: AXIS_H,
  day,
  onDrop: handleDrop,
});
```

- [ ] **Step 3: Reemplazar `apptBlockStyle` por el nuevo sistema en los bloques de cita**

Localizar la clase del bloque interno `div` con `apptBlockStyle`. Reemplazar:

```tsx
// ANTES:
className={`flex h-full w-full flex-col overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] transition ${canWrite ? "cursor-pointer hover:shadow-md" : "cursor-default"} ${apptBlockStyle(a.status)} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}

// DESPUÉS:
const col = getDoctorColor(a.dentist_name ?? "");
// ...
className={`flex h-full w-full flex-col overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] transition ${col.bg} ${col.border} ${col.text} ${apptBlockClass(a.status)} ${isDragging(a.id) ? "scale-105 shadow-xl z-30 opacity-90" : canWrite ? "hover:shadow-md cursor-grab active:cursor-grabbing" : "cursor-default"} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}
```

Agregar `{...dragHandlers(a.id)}` al elemento si `canWrite`.

- [ ] **Step 4: Mostrar ✓ para citas atendidas**

Dentro del bloque, agregar después del nombre del paciente:

```tsx
{isFinished(a.status) && (
  <span className="absolute right-1 top-0.5 text-[10px] font-bold opacity-80">✓</span>
)}
```

- [ ] **Step 5: Agregar ghost slot en DayView**

Dentro del contenedor de columna, igual que en WeekView:

```tsx
{ghostSlot && (() => {
  const [gh, gm] = ghostSlot.time.split(":").map(Number);
  const gDate = new Date(y, m - 1, d, gh, gm);
  const gEnd = new Date(gDate.getTime() + 30 * 60_000);
  const gg = blockGeometry(gDate, gEnd);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 animate-ghost-pulse rounded border-2 border-dashed border-clinic bg-clinic/20"
      style={{ top: gg.top * AXIS_H, height: Math.max(gg.height * AXIS_H, 20) }}
    />
  );
})()}
```

- [ ] **Step 6: Usar `localAppts` en el render**

Reemplazar `appts` por `localAppts` en el `useMemo` de `columns` y en el `assignLanes` de cada columna.

- [ ] **Step 7: TypeScript y tests**

```
npx tsc --noEmit && npx vitest run
```

Resultado esperado: 0 errores, todos los tests en verde

- [ ] **Step 8: Commit**

```
git add components/agenda/DayView.tsx
git commit -m "feat(agenda): DayView — color por doctor + drag + check atendido"
```

---

## Task 7: Tests de integración de componentes

**Files:**
- Create: `tests/agendaComponents.test.tsx`

- [ ] **Step 1: Instalar testing-library si no está**

```
npx vitest run
```

Si falla por falta de `@testing-library/react`, instalar:

```
npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom
```

Y actualizar `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  // ...
});
```

Crear `tests/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 2: Escribir los tests de integración**

Crear `tests/agendaComponents.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthView } from "@/components/agenda/MonthView";
import { getDoctorColor } from "@/lib/agenda/doctorColor";

const makeAppt = (overrides: Record<string, unknown> = {}) => ({
  id: "a1",
  starts_at: "2026-06-10T09:00:00",
  ends_at: "2026-06-10T10:00:00",
  status: "scheduled",
  dentist_name: "Dr. Pérez",
  patient_id: null,
  patient_name: null,
  reason: null,
  consult_price: null,
  deposit: null,
  deposit_method: null,
  patients: { full_name: "Ana Vargas", national_id: null },
  ...overrides,
});

describe("MonthView — pastillas de nombre", () => {
  it("muestra el nombre del paciente en lugar de badge contador", () => {
    const byDay = new Map([["2026-06-10", [makeAppt()]]]);
    render(
      <MonthView
        month="2026-06-10"
        byDay={byDay}
        selectedDay={null}
        onSelectDay={() => {}}
      />,
    );
    expect(screen.getByText("Ana Vargas")).toBeInTheDocument();
    expect(screen.queryByText("1 cita")).not.toBeInTheDocument();
  });

  it("con 3 citas muestra 2 pastillas + '+1 más'", () => {
    const appts = [
      makeAppt({ id: "a1", patients: { full_name: "Ana", national_id: null } }),
      makeAppt({ id: "a2", patients: { full_name: "Luis", national_id: null } }),
      makeAppt({ id: "a3", patients: { full_name: "María", national_id: null } }),
    ];
    const byDay = new Map([["2026-06-10", appts]]);
    render(
      <MonthView
        month="2026-06-10"
        byDay={byDay}
        selectedDay={null}
        onSelectDay={() => {}}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
    expect(screen.queryByText("María")).not.toBeInTheDocument();
    expect(screen.getByText("+1 más")).toBeInTheDocument();
  });
});

describe("getDoctorColor — colores distintos para doctores distintos", () => {
  it("dos doctores con ids distintos tienen al menos bg distinto en algunos casos", () => {
    // Verificamos que la función diferencia doctores — no todos pueden ser iguales
    const colors = ["Dr. Pérez", "Dr. Soto", "Dr. Rojas", "Dr. Lima"]
      .map((n) => getDoctorColor(n).bg);
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Correr los tests de integración**

```
npx vitest run tests/agendaComponents.test.tsx
```

Resultado esperado: PASS

- [ ] **Step 4: Verificar suite completa**

```
npx vitest run
```

Resultado esperado: todos los tests en verde (incluyendo los 93 originales)

- [ ] **Step 5: Commit**

```
git add tests/agendaComponents.test.tsx tests/setup.ts vitest.config.ts
git commit -m "test(agenda): integration tests MonthView pastillas + color por doctor"
```

---

## Task 8: Pulido visual final — animaciones y sombras

**Files:**
- Modify: `tailwind.config.ts` (si no se hizo en Task 2 y 5)
- Modify: `app/globals.css` (agregar clases CSS para sombras del drag)

- [ ] **Step 1: Verificar que `tailwind.config.ts` tiene todas las animaciones**

Leer el archivo y confirmar que existen:
- `animate-pulse-ring` y keyframes `pulse-ring`
- `animate-ghost-pulse` y keyframes `ghost-pulse`
- `animate-flash` (ya existía)

Si falta alguna, agregar en el lugar correcto.

- [ ] **Step 2: Agregar `animate-shake` para revert de drag fallido**

En `tailwind.config.ts`, dentro de `theme.extend.keyframes`:

```ts
"shake": {
  "0%, 100%": { transform: "translateX(0)" },
  "20%, 60%": { transform: "translateX(-4px)" },
  "40%, 80%": { transform: "translateX(4px)" },
},
```

En `theme.extend.animation`:

```ts
"shake": "shake 0.3s ease-in-out",
```

- [ ] **Step 3: Aplicar `animate-shake` en `handleDrop` cuando hay error**

En ambos `WeekView.tsx` y `DayView.tsx`, en el bloque `catch` de `handleDrop`:

```tsx
catch {
  setLocalAppts(revertMove(updated, appts));
  // Marcar el id para aplicar shake — usar un state separado
  setShakingId(apptId);
  setTimeout(() => setShakingId(null), 400);
}
```

Agregar `const [shakingId, setShakingId] = useState<string | null>(null)` al inicio del componente.

En la clase del bloque de cita, agregar:

```tsx
${shakingId === a.id ? "animate-shake" : ""}
```

- [ ] **Step 4: TypeScript final**

```
npx tsc --noEmit
```

Resultado esperado: 0 errores

- [ ] **Step 5: Suite final completa**

```
npx vitest run
```

Resultado esperado: todos los tests en verde

- [ ] **Step 6: Commit final**

```
git add tailwind.config.ts components/agenda/WeekView.tsx components/agenda/DayView.tsx
git commit -m "feat(agenda): shake animation en revert + pulido visual completo"
```

---

---

## Task 9: AgendaShell — barra de controles pulida + puntito de color en dropdown

**Files:**
- Modify: `components/agenda/AgendaShell.tsx`

Cambios:
1. Segmented control D/S/M con indicador de "pastilla" animado.
2. Dropdown de doctor reemplazado por un `<select>` estilizado con puntito de color.
3. Botón WA empujado al extremo derecho con `ml-auto`.

- [ ] **Step 1: Agregar import de `getDoctorColor` en `AgendaShell.tsx`**

```tsx
import { getDoctorColor } from "@/lib/agenda/doctorColor";
```

- [ ] **Step 2: Reemplazar el bloque del segmented control (líneas ~198–211)**

```tsx
// ANTES:
<div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
  {views.map((v) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      className={`rounded px-3 py-1.5 capitalize transition ${
        view === v ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
      }`}
    >
      {VIEW_LABELS[v]}
    </button>
  ))}
</div>

// DESPUÉS:
<div className="relative flex rounded-lg bg-slate-100 p-0.5 text-sm shadow-inner">
  {views.map((v) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      className={`relative z-10 rounded-md px-3 py-1.5 capitalize transition-colors duration-150 ${
        view === v
          ? "bg-white font-semibold text-clinic shadow-sm"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {VIEW_LABELS[v]}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Reemplazar el `<select>` de doctor por uno con puntito de color**

El `<select>` nativo no puede tener puntitos, así que se agrega el puntito de color visualmente afuera:

```tsx
// ANTES:
{isAdmin && (
  <select
    value={activeDoctor}
    onChange={(e) => setActiveDoctor(e.target.value)}
    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
  >
    <option value={myName}>Mi Agenda</option>
    <option value={ALL_DOCTORS}>Todos los doctores</option>
    {doctors
      .filter((d) => d.full_name !== myName)
      .map((d) => (
        <option key={d.id} value={d.full_name}>
          {d.full_name}
        </option>
      ))}
  </select>
)}

// DESPUÉS:
{isAdmin && (
  <div className="flex items-center gap-1.5">
    {activeDoctor !== ALL_DOCTORS && activeDoctor && (
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${getDoctorColor(
          doctors.find((d) => d.full_name === activeDoctor)?.id ?? activeDoctor
        ).border.replace("border-", "bg-")}`}
      />
    )}
    <select
      value={activeDoctor}
      onChange={(e) => setActiveDoctor(e.target.value)}
      className="rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-sm font-medium text-slate-700 shadow-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
    >
      <option value={myName}>Mi Agenda</option>
      <option value={ALL_DOCTORS}>Todos los doctores</option>
      {doctors
        .filter((d) => d.full_name !== myName)
        .map((d) => (
          <option key={d.id} value={d.full_name}>
            {d.full_name}
          </option>
        ))}
    </select>
  </div>
)}
```

- [ ] **Step 4: Empujar el botón WA al extremo derecho**

Localizar el botón de WhatsApp en `AgendaShell.tsx`. Agregar `ml-auto` al primer elemento que le preceda o hacer que el flex container justifique con espacio:

```tsx
// En el contenedor de la barra de controles, cambiar:
<div className="flex flex-wrap items-center gap-2">
// Por:
<div className="flex flex-wrap items-center gap-2">
  {/* ... controles existentes ... */}
  <div className="ml-auto flex items-center gap-2">
    {/* botón WA aquí */}
  </div>
</div>
```

- [ ] **Step 5: TypeScript y tests**

```
npx tsc --noEmit && npx vitest run
```

Resultado esperado: 0 errores, todos los tests en verde

- [ ] **Step 6: Commit**

```
git add components/agenda/AgendaShell.tsx
git commit -m "feat(agenda): barra controles — segmented control pulido + puntito de color doctor"
```

---

## Verificación final

- [ ] Abrir la app en el browser y navegar a `/agenda`
- [ ] Confirmar que WeekView muestra bloques de distintos colores por doctor
- [ ] Confirmar que citas `no_show` aparecen grises con texto tachado
- [ ] Arrastrar un bloque y soltarlo en otro slot — verificar que se mueve
- [ ] Verificar que MonthView muestra pastillas de nombre (no el badge "N citas")
- [ ] Correr `npx vitest run` — todos en verde
- [ ] Correr `npx tsc --noEmit` — 0 errores
