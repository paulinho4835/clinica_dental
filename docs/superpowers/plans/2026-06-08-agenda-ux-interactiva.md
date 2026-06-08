# Agenda Interactiva (Día / Semana / Mes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la agenda actual (calendario mensual + lista vertical del día) por tres vistas conmutables — Día (horario visual con columnas por odontólogo), Semana (7 columnas) y Mes (el actual) — con clic-en-hueco para agendar más rápido.

**Architecture:** Toda la lógica de posición/columnas/solapamiento vive como funciones puras en `lib/agenda.ts` (testeadas con Vitest). El monolito `components/agenda/AgendaCalendar.tsx` (~1.080 líneas) se parte en piezas de una responsabilidad: `AgendaShell` (toggle + navegación + buscador), `MonthView`, `WeekView`, `DayView`, `ApptModal`, `LinkPatientModal`. La vista vive en la URL (`?view=`). No hay cambios de base de datos ni de server actions; Día y Semana derivan de las citas ya cargadas en el cliente. `page.tsx` amplía el rango de fetch a la grilla de 6 semanas.

**Tech Stack:** Next.js 15 (App Router, RSC), React 19, TypeScript, Tailwind (color de marca `clinic`), Vitest (`environment: node`), Playwright (E2E), Supabase, lucide-react.

---

## Convenciones de este repo (leer antes de empezar)

- **Tests unitarios:** Vitest, archivos en `tests/*.test.ts`, alias `@/` → raíz. Entorno `node` (NO hay DOM/jsdom). Por eso solo se testean funciones puras; los componentes se verifican a mano + E2E.
- **Fechas en hora local:** el repo trabaja todo en hora local de Bolivia. Las cadenas `YYYY-MM-DDTHH:MM:00` sin offset se parsean como hora local — los tests dependen de eso (ver `tests/agenda.test.ts`). NO introducir `toISOString()` en la lógica de posición.
- **Comandos:**
  - Unit: `npm test` (corre `vitest run`). Un archivo: `npx vitest run tests/agenda.test.ts`.
  - Tipos: `npm run typecheck`.
  - Dev (verificación manual): `npm run dev` → http://localhost:3000/agenda
  - E2E: `npm run test:e2e`
- **Commits frecuentes**, uno por tarea. Mensaje en español, terminando con la línea `Co-Authored-By`.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `lib/agenda.ts` | Modificar | Agregar helpers puros: `blockGeometry`, `gridRange`, `weekDays`, `dentistColumns`, `assignLanes`. |
| `tests/agenda.test.ts` | Modificar | Tests de los helpers nuevos. |
| `components/agenda/apptHelpers.ts` | Crear | Tipos y helpers compartidos (`MonthAppt`, `DoctorOption`, `apptName`, `apptCI`, `isQuickConsult`, estilos por estado). |
| `components/agenda/ApptModal.tsx` | Crear | Modal crear/editar (extraído sin cambios de lógica). |
| `components/agenda/LinkPatientModal.tsx` | Crear | Modal vincular paciente (extraído sin cambios). |
| `components/agenda/MiniStatus.tsx` | Crear | Control de asistencia (extraído sin cambios). |
| `components/agenda/MonthView.tsx` | Crear | Calendario mensual (extraído del actual). |
| `components/agenda/DayView.tsx` | Crear | Horario visual del día. |
| `components/agenda/WeekView.tsx` | Crear | Grilla semanal. |
| `components/agenda/SearchBar.tsx` | Crear | Buscador (extraído sin cambios). |
| `components/agenda/AgendaShell.tsx` | Crear | Contenedor: toggle Día/Semana/Mes, navegación, buscador, modales. |
| `components/agenda/AgendaCalendar.tsx` | Eliminar | Reemplazado por las piezas anteriores. |
| `app/(dashboard)/agenda/page.tsx` | Modificar | Ampliar fetch a la grilla de 6 semanas; leer `view`; renderizar `AgendaShell`. |

---

## Task 1: Helpers puros de geometría y rango (`blockGeometry`, `gridRange`)

**Files:**
- Modify: `lib/agenda.ts`
- Test: `tests/agenda.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/agenda.test.ts` (dentro del archivo, después de los `describe` existentes). Importar los símbolos nuevos en el bloque `import` de arriba: añadir `blockGeometry`, `gridRange` a la lista importada desde `@/lib/agenda`.

```ts
describe("blockGeometry", () => {
  it("cita de día completo (08:00–20:00) ocupa todo el alto", () => {
    const g = blockGeometry(new Date(at("08:00")), new Date(at("20:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1, 5);
  });

  it("cita 08:00–09:00 ocupa la primera 1/12 del día", () => {
    const g = blockGeometry(new Date(at("08:00")), new Date(at("09:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });

  it("cita 14:00–14:30 se posiciona a la mitad con alto de media hora", () => {
    const g = blockGeometry(new Date(at("14:00")), new Date(at("14:30")));
    expect(g.top).toBeCloseTo(6 / 12, 5); // 14:00 = 6h desde apertura
    expect(g.height).toBeCloseTo(0.5 / 12, 5);
  });

  it("recorta una cita que empieza antes de apertura", () => {
    const g = blockGeometry(new Date(at("07:00")), new Date(at("09:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });

  it("recorta una cita que termina después del cierre", () => {
    const g = blockGeometry(new Date(at("19:00")), new Date(at("21:00")));
    expect(g.top).toBeCloseTo(11 / 12, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });
});

describe("gridRange", () => {
  it("cubre 42 días empezando un lunes", () => {
    // Junio 2026: el 1 es lunes => la grilla arranca el 2026-06-01.
    const { start, end } = gridRange(new Date(2026, 5, 15));
    expect(start.getDay()).toBe(1); // lunes
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(42);
  });

  it("arranca el lunes de la semana que contiene el día 1", () => {
    // Julio 2026: el 1 es miércoles => la grilla arranca el lunes 2026-06-29.
    const { start } = gridRange(new Date(2026, 6, 10));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // junio
    expect(start.getDate()).toBe(29);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run tests/agenda.test.ts`
Expected: FAIL — `blockGeometry is not a function` / `gridRange is not a function`.

- [ ] **Step 3: Implementar en `lib/agenda.ts`**

Agregar al final de `lib/agenda.ts`:

```ts
// ─── Geometría de un bloque dentro del eje de horas (fracciones 0..1) ────────
// Devuelve la posición vertical (top) y la altura como fracción del día visible
// [OPEN_HOUR, CLOSE_HOUR]. El componente las multiplica por su alto en píxeles.
// Recorta citas que se salen del horario para que nunca desborden.
export type BlockGeom = { top: number; height: number };

export function blockGeometry(start: Date, end: Date): BlockGeom {
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const toMin = (d: Date) => d.getHours() * 60 + d.getMinutes() - OPEN_HOUR * 60;
  const s = Math.max(0, Math.min(total, toMin(start)));
  const e = Math.max(0, Math.min(total, toMin(end)));
  return { top: s / total, height: Math.max(0, (e - s) / total) };
}

// Rango [inicio, fin) que cubre la grilla de 6 semanas (42 días, lunes primero)
// del mes que contiene `date`. Se usa para traer las citas del server: así la
// vista Semana en el borde de mes no aparece vacía.
export function gridRange(date: Date): { start: Date; end: Date } {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // 0 = lunes
  const start = new Date(date.getFullYear(), date.getMonth(), 1 - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return { start, end };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run tests/agenda.test.ts`
Expected: PASS (todos, incluidos los previos).

- [ ] **Step 5: Commit**

```bash
git add lib/agenda.ts tests/agenda.test.ts
git commit -m "feat(agenda): helpers puros blockGeometry y gridRange

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper `weekDays`

**Files:**
- Modify: `lib/agenda.ts`
- Test: `tests/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar `weekDays` a los imports desde `@/lib/agenda`. Añadir al final de `tests/agenda.test.ts`:

```ts
describe("weekDays", () => {
  it("devuelve lunes..domingo de la semana que contiene la fecha", () => {
    // 2026-06-10 es miércoles.
    const days = weekDays(new Date(2026, 5, 10));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // lunes
    expect(days[0].getDate()).toBe(8); // lun 8
    expect(days[6].getDay()).toBe(0); // domingo
    expect(days[6].getDate()).toBe(14); // dom 14
  });

  it("para un domingo devuelve la semana que termina ese domingo", () => {
    // 2026-06-14 es domingo.
    const days = weekDays(new Date(2026, 5, 14));
    expect(days[0].getDate()).toBe(8);
    expect(days[6].getDate()).toBe(14);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run tests/agenda.test.ts`
Expected: FAIL — `weekDays is not a function`.

- [ ] **Step 3: Implementar en `lib/agenda.ts`**

Agregar al final:

```ts
// Los 7 días (lunes..domingo) de la semana que contiene `date`, en hora local.
export function weekDays(date: Date): Date[] {
  const offset = (date.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run tests/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agenda.ts tests/agenda.test.ts
git commit -m "feat(agenda): helper puro weekDays

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helper `dentistColumns`

**Files:**
- Modify: `lib/agenda.ts`
- Test: `tests/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar `dentistColumns` a los imports. Añadir al final de `tests/agenda.test.ts`:

```ts
describe("dentistColumns", () => {
  const a = (name: string | null) => ({ dentist_name: name });

  it("un solo odontólogo => una columna", () => {
    expect(dentistColumns([a("Dra. Paz"), a("Dra. Paz")])).toEqual(["Dra. Paz"]);
  });

  it("varios odontólogos => columnas ordenadas alfabéticamente", () => {
    expect(dentistColumns([a("Dr. Soto"), a("Dra. Paz")])).toEqual([
      "Dra. Paz",
      "Dr. Soto",
    ]);
  });

  it("nombres vacíos o null caen en 'Sin asignar'", () => {
    expect(dentistColumns([a(null), a("  ")])).toEqual(["Sin asignar"]);
  });

  it("día sin citas => sin columnas", () => {
    expect(dentistColumns([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run tests/agenda.test.ts`
Expected: FAIL — `dentistColumns is not a function`.

- [ ] **Step 3: Implementar en `lib/agenda.ts`**

Agregar al final:

```ts
// Nombres distintos de odontólogo con cita ese día, ordenados alfabéticamente.
// Decide cuántas columnas dibuja la vista Día (0–1 => una columna ancha).
// Citas sin odontólogo caen en "Sin asignar".
export function dentistColumns<T extends { dentist_name: string | null }>(
  appts: T[],
): string[] {
  const names = new Set<string>();
  for (const a of appts) names.add(a.dentist_name?.trim() || "Sin asignar");
  return [...names].sort((x, y) => x.localeCompare(y, "es"));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run tests/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agenda.ts tests/agenda.test.ts
git commit -m "feat(agenda): helper puro dentistColumns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Helper `assignLanes` (reparto lado a lado de solapadas)

**Files:**
- Modify: `lib/agenda.ts`
- Test: `tests/agenda.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar `assignLanes` a los imports. Añadir al final de `tests/agenda.test.ts`:

```ts
describe("assignLanes", () => {
  it("citas que no se solapan van todas en la lane 0 (1 lane)", () => {
    const laid = assignLanes([appt("09:00", "10:00"), appt("10:00", "11:00")]);
    expect(laid.map((l) => l.lane)).toEqual([0, 0]);
    expect(laid.every((l) => l.lanes === 1)).toBe(true);
  });

  it("dos citas solapadas => lanes 0 y 1, ambas con lanes=2", () => {
    const laid = assignLanes([appt("09:00", "10:00"), appt("09:30", "10:30")]);
    expect(laid.map((l) => l.lane).sort()).toEqual([0, 1]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });

  it("reusa una lane libre cuando una cita anterior ya terminó", () => {
    // A 09–10 y B 09:30–10:30 solapan (2 lanes). C 10:00–11:00 puede reusar
    // la lane de A. Las tres están en el mismo cluster (cadena solapada).
    const laid = assignLanes([
      appt("09:00", "10:00"),
      appt("09:30", "10:30"),
      appt("10:00", "11:00"),
    ]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });

  it("preserva la cita original en el resultado", () => {
    const a = appt("09:00", "10:00");
    const laid = assignLanes([a]);
    expect(laid[0].appt).toBe(a);
    expect(laid[0]).toMatchObject({ lane: 0, lanes: 1 });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run tests/agenda.test.ts`
Expected: FAIL — `assignLanes is not a function`.

- [ ] **Step 3: Implementar en `lib/agenda.ts`**

Agregar al final. Reutiliza `TimeAppt` y `STEP_MIN` ya definidos arriba en el archivo:

```ts
// Reparte citas solapadas en "lanes" (sub-columnas) lado a lado para que ninguna
// quede tapada. Devuelve por cita su lane y el total de lanes de su grupo, de modo
// que el ancho de cada bloque sea 1/lanes. Agrupa en clusters de citas encadenadas
// por solapamiento y asigna greedily la primera lane libre.
export type Laid<T> = { appt: T; lane: number; lanes: number };

export function assignLanes<T extends TimeAppt>(appts: T[]): Laid<T>[] {
  const defMs = STEP_MIN * 60_000;
  const items = appts
    .map((a) => {
      const s = new Date(a.starts_at).getTime();
      const e = a.ends_at ? new Date(a.ends_at).getTime() : s + defMs;
      return { a, s, e };
    })
    .sort((x, y) => x.s - y.s || x.e - y.e);

  const result: Laid<T>[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneEnds: number[] = []; // fin de la última cita en cada lane
    const assigned: { a: T; lane: number }[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.e);
      } else {
        laneEnds[lane] = it.e;
      }
      assigned.push({ a: it.a, lane });
    }
    const lanes = laneEnds.length;
    for (const x of assigned) result.push({ appt: x.a, lane: x.lane, lanes });
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return result;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run tests/agenda.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/agenda.ts tests/agenda.test.ts
git commit -m "feat(agenda): helper puro assignLanes para citas solapadas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Extraer tipos y helpers compartidos a `apptHelpers.ts`

Refactor mecánico, sin cambios de comportamiento. Saca de `AgendaCalendar.tsx` los tipos y helpers que varios componentes van a compartir.

**Files:**
- Create: `components/agenda/apptHelpers.ts`

- [ ] **Step 1: Crear `components/agenda/apptHelpers.ts`**

Copiar EXACTAMENTE estas definiciones (son las que hoy viven al inicio de `AgendaCalendar.tsx`, líneas ~30–54 y ~428–438):

```ts
// Tipos y helpers compartidos por las vistas de la agenda.

export type MonthAppt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  dentist_name: string | null;
  patient_id: string | null; // expediente vinculado (null en consulta rápida)
  patient_name: string | null; // nombre suelto (paciente no registrado)
  reason: string | null;
  consult_price: number | null;
  deposit: number | null;
  deposit_method: string | null;
  patients: { full_name?: string; national_id?: string | null } | null;
};

export type DoctorOption = { id: string; full_name: string };

// Nombre a mostrar: paciente registrado o, si no, el nombre suelto.
export const apptName = (a: MonthAppt) =>
  a.patients?.full_name ?? a.patient_name ?? "Cita";

// CI del paciente (solo registrados lo tienen).
export const apptCI = (a: MonthAppt) => a.patients?.national_id ?? null;

// Consulta rápida = sin paciente registrado pero con nombre suelto.
export const isQuickConsult = (a: MonthAppt) =>
  !a.patients?.full_name && !!a.patient_name;

// ─── Color por estado de cita ───────────────────────────────────────────────
export function apptRowStyle(status: string) {
  if (status === "finished") return "border-l-2 border-emerald-400 bg-emerald-50/60";
  if (status === "no_show") return "border-l-2 border-slate-300 bg-slate-50/60 opacity-60";
  return "border-l-2 border-clinic/60 bg-clinic/5"; // scheduled
}

export const apptNameColor = (status: string) =>
  status === "finished"
    ? "text-emerald-700"
    : status === "no_show"
      ? "text-slate-400 line-through"
      : "text-slate-800";

// Fondo del bloque en las vistas Día/Semana, por estado.
export function apptBlockStyle(status: string) {
  if (status === "finished") return "border-emerald-400 bg-emerald-50 text-emerald-800";
  if (status === "no_show") return "border-slate-300 bg-slate-100 text-slate-400";
  return "border-clinic/50 bg-clinic/10 text-slate-800"; // scheduled
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS (archivo nuevo, autocontenido; aún nadie lo importa).

- [ ] **Step 3: Commit**

```bash
git add components/agenda/apptHelpers.ts
git commit -m "refactor(agenda): extraer tipos y helpers a apptHelpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Extraer `MiniStatus`, `SearchBar`, `ApptModal`, `LinkPatientModal`

Mover los componentes auto-contenidos a sus propios archivos, importando de `apptHelpers`. **Sin cambiar su lógica interna** — solo el `import` y el `export`.

**Files:**
- Create: `components/agenda/MiniStatus.tsx`
- Create: `components/agenda/SearchBar.tsx`
- Create: `components/agenda/ApptModal.tsx`
- Create: `components/agenda/LinkPatientModal.tsx`

- [ ] **Step 1: Crear `components/agenda/MiniStatus.tsx`**

Mover el componente `MiniStatus` (hoy en `AgendaCalendar.tsx` líneas ~343–426) a este archivo. Encabezar con `"use client";` y estos imports, y exportar la función con `export function MiniStatus(...)`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentStatus } from "@/app/(dashboard)/agenda/actions";
import { RotateCcw, Check, X } from "lucide-react";
```

El cuerpo de `MiniStatus` se copia tal cual del original.

- [ ] **Step 2: Crear `components/agenda/SearchBar.tsx`**

Mover `SearchBar` (líneas ~296–337). Encabezar:

```tsx
"use client";

import { useState } from "react";
import { Search } from "lucide-react";
```

Exportar `export function SearchBar(...)` con el cuerpo original intacto.

- [ ] **Step 3: Crear `components/agenda/ApptModal.tsx`**

Mover `ApptModal` y su helper local `hhmmInput` (líneas ~589–912). Encabezar:

```tsx
"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  type ActionState,
} from "@/app/(dashboard)/agenda/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { bs } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { confirm } from "@/lib/confirm";
import { mins } from "@/lib/agenda";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  isQuickConsult,
} from "./apptHelpers";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmmInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const initial: ActionState = {};
```

Copiar el cuerpo de `ApptModal` tal cual, exportándolo con `export function ApptModal(...)`. (El original usaba `dayKey` y `pad` del módulo; arriba se redefinen localmente, idénticos.)

- [ ] **Step 4: Crear `components/agenda/LinkPatientModal.tsx`**

Mover `LinkPatientModal` (líneas ~917–1083). Encabezar:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkAppointmentPatient } from "@/app/(dashboard)/agenda/actions";
import { createPatientQuick } from "@/app/(dashboard)/pacientes/actions";
import { PatientPicker, type PatientOption } from "./PatientPicker";
import { Modal } from "@/components/ui/Modal";
import { type MonthAppt } from "./apptHelpers";
```

Exportar `export function LinkPatientModal(...)` con el cuerpo original intacto.

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS. (Estos archivos aún no se usan, pero deben compilar solos.)

> Nota: `AgendaCalendar.tsx` todavía existe y define los mismos componentes. No hay choque porque están en archivos distintos. Se elimina en la Task 7.

- [ ] **Step 6: Commit**

```bash
git add components/agenda/MiniStatus.tsx components/agenda/SearchBar.tsx components/agenda/ApptModal.tsx components/agenda/LinkPatientModal.tsx
git commit -m "refactor(agenda): extraer MiniStatus, SearchBar y modales a sus archivos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `MonthView` + `AgendaShell` + cableado de `page.tsx` (paridad con hoy)

Esta tarea deja la app funcionando IGUAL que hoy pero con la arquitectura nueva: la vista por defecto será **Mes** todavía (Día/Semana se enchufan en Tasks 8–9). Al final se elimina `AgendaCalendar.tsx`.

**Files:**
- Create: `components/agenda/MonthView.tsx`
- Create: `components/agenda/AgendaShell.tsx`
- Modify: `app/(dashboard)/agenda/page.tsx`
- Delete: `components/agenda/AgendaCalendar.tsx`

- [ ] **Step 1: Crear `components/agenda/MonthView.tsx`**

Componente presentacional del calendario mensual. Extrae la grilla mensual del actual `AgendaCalendar` (líneas ~196–250). Recibe las citas agrupadas por día y notifica la selección hacia arriba.

```tsx
"use client";

import { useMemo } from "react";
import { type MonthAppt } from "./apptHelpers";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function MonthView({
  month, // YYYY-MM-DD (cualquier día del mes visible)
  byDay,
  selectedDay,
  onSelectDay,
}: {
  month: string;
  byDay: Map<string, MonthAppt[]>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const base = new Date(month + "T00:00:00");
  const year = base.getFullYear();
  const mon = base.getMonth();
  const todayKey = dayKey(new Date());

  const cells = useMemo(() => {
    const first = new Date(year, mon, 1);
    const offset = (first.getDay() + 6) % 7; // 0 = lunes
    const start = new Date(year, mon, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, mon]);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium uppercase text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === mon;
          const dayAppts = byDay.get(k) ?? [];
          const isSelected = selectedDay === k;
          const isToday = k === todayKey;
          return (
            <button
              key={k}
              type="button"
              disabled={!inMonth}
              onClick={() => onSelectDay(k)}
              className={`flex min-h-[68px] flex-col items-start gap-1 border-b border-r border-slate-100 p-2 text-left transition ${
                !inMonth ? "cursor-default bg-slate-50/60 text-slate-300" : "hover:bg-clinic/5"
              } ${isSelected ? "ring-2 ring-inset ring-clinic" : ""}`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                  isToday ? "bg-clinic font-bold text-white" : "text-slate-600"
                }`}
              >
                {d.getDate()}
              </span>
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
                    {dayAppts.some((a) => a.status === "no_show") && (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" title="No vino" />
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear `components/agenda/AgendaShell.tsx`**

El contenedor. En esta tarea solo renderiza Mes (paridad). Mantiene el buscador, la navegación y el `DayTimeline` actual como sub-vista del día seleccionado para no perder funcionalidad mientras Día/Semana se construyen. Para no reescribir el `DayTimeline`, lo movemos aquí como componente interno temporal (se reemplaza por `DayView` en Task 8).

> **Acción concreta:** copiar el cuerpo del actual `AgendaCalendar` (la función exportada, su estado, `runSearch`, `shiftMonth`, los `useEffect`, y los sub-componentes `DayTimeline`) a `AgendaShell.tsx`, y aplicar estos cambios:
> 1. Renombrar la función exportada a `AgendaShell`.
> 2. Reemplazar la grilla mensual inline por `<MonthView month={month} byDay={byDay} selectedDay={selectedDay} onSelectDay={setSelectedDay} />`.
> 3. Importar `SearchBar`, `MiniStatus`, `ApptModal`, `LinkPatientModal` y los helpers desde sus nuevos archivos en vez de tenerlos inline.
> 4. Agregar las props `view` y `date` (ver firma abajo) — en esta tarea `view` se acepta pero solo se usa para el toggle visual; el render sigue mostrando Mes + DayTimeline.

Imports y firma:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STEP_MIN } from "@/lib/agenda";
import { type PatientOption } from "./PatientPicker";
import { SearchBar } from "./SearchBar";
import { MonthView } from "./MonthView";
import { ApptModal } from "./ApptModal";
import { LinkPatientModal } from "./LinkPatientModal";
import {
  type MonthAppt,
  type DoctorOption,
  apptName,
  apptCI,
} from "./apptHelpers";

export type AgendaView = "day" | "week" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type ModalState = { start: Date; end: Date; appt?: MonthAppt; dentist?: string };

export function AgendaShell({
  patients,
  appts,
  date, // YYYY-MM-DD del día/mes visible
  view,
  canWrite,
  doctors,
}: {
  patients: PatientOption[];
  appts: MonthAppt[];
  date: string;
  view: AgendaView;
  canWrite: boolean;
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(
    view === "day" ? date : null,
  );
  const [modal, setModal] = useState<ModalState | null>(null);
  const [linkAppt, setLinkAppt] = useState<MonthAppt | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, MonthAppt[]>();
    for (const a of appts) {
      const k = dayKey(new Date(a.starts_at));
      (map.get(k) ?? map.set(k, []).get(k)!).push(a);
    }
    return map;
  }, [appts]);

  // Cambia de vista conservando la fecha (la vista vive en la URL).
  function setView(next: AgendaView) {
    router.push(`/agenda?date=${date}&view=${next}`);
  }

  // Navegación adaptativa por vista.
  function shift(delta: number) {
    const d = new Date(date + "T00:00:00");
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    router.push(`/agenda?date=${dayKey(d)}&view=${view}`);
  }

  function goToday() {
    router.push(`/agenda?date=${dayKey(new Date())}&view=${view}`);
  }

  function runSearch(raw: string) {
    const q = raw.trim().toLowerCase();
    setSearchMsg(null);
    setHighlightId(null);
    if (!q) return;
    const matches = (a: MonthAppt) =>
      apptName(a).toLowerCase().includes(q) ||
      (apptCI(a) ?? "").toLowerCase().includes(q);
    const hit = appts.find(matches);
    if (!hit) {
      setSearchMsg(`Sin citas para “${raw.trim()}” en este mes.`);
      return;
    }
    const k = dayKey(new Date(hit.starts_at));
    // Al encontrar, saltar a la vista Día de esa fecha con la cita resaltada.
    setSelectedDay(k);
    setHighlightId(hit.id);
    if (view !== "day") router.push(`/agenda?date=${k}&view=day`);
  }

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const base = new Date(date + "T00:00:00");
  const monthLabel = base.toLocaleDateString("es-BO", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <SearchBar onSearch={runSearch} message={searchMsg} />

      {/* Toggle de vista + navegación */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 py-1.5 capitalize transition ${
                view === v ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
              }`}
            >
              {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <button onClick={() => shift(-1)} aria-label="Anterior" className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={goToday} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Hoy
        </button>
        <button onClick={() => shift(1)} aria-label="Siguiente" className="rounded-md border border-slate-300 p-1.5 hover:bg-slate-50">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-2 text-lg font-semibold capitalize text-slate-700">{monthLabel}</span>
      </div>

      {/* En esta tarea: siempre Mes + timeline del día (paridad). Día/Semana en Tasks 8–9. */}
      <MonthView month={date} byDay={byDay} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {selectedDay && (
        <DayTimeline
          day={selectedDay}
          appts={byDay.get(selectedDay) ?? []}
          canWrite={canWrite}
          highlightId={highlightId}
          onPick={(start, end) => setModal({ start, end })}
          onEdit={(a) =>
            setModal({
              start: new Date(a.starts_at),
              end: a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
              appt: a,
            })
          }
          onLink={(a) => setLinkAppt(a)}
        />
      )}

      {modal && (
        <ApptModal
          patients={patients}
          doctors={doctors}
          start={modal.start}
          end={modal.end}
          appt={modal.appt}
          onClose={() => setModal(null)}
        />
      )}
      {linkAppt && (
        <LinkPatientModal patients={patients} appt={linkAppt} onClose={() => setLinkAppt(null)} />
      )}
    </div>
  );
}
```

Debajo de `AgendaShell`, en el MISMO archivo, pegar el `DayTimeline` original (líneas ~441–587 del `AgendaCalendar` actual) tal cual, ajustando solo sus imports para que use `apptName`, `apptCI`, `isQuickConsult`, `apptRowStyle`, `apptNameColor` desde `./apptHelpers`, `mins`/`STEP_MIN`/`buildTimeline` desde `@/lib/agenda`, `MiniStatus` desde `./MiniStatus`, y los iconos `Pencil` de `lucide-react`. (Es temporal; la Task 8 lo reemplaza por `DayView`.)

- [ ] **Step 3: Reescribir `app/(dashboard)/agenda/page.tsx`**

Reemplazar el archivo completo por:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AgendaShell, type AgendaView } from "@/components/agenda/AgendaShell";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";
import { requireFeature } from "@/lib/guard";
import { boliviaTodayISO } from "@/lib/format";
import { gridRange } from "@/lib/agenda";

const isView = (v: string | undefined): v is AgendaView =>
  v === "day" || v === "week" || v === "month";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  await requireFeature("agenda");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : boliviaTodayISO();
  const view: AgendaView = isView(sp.view) ? sp.view : "day";

  // Rango = grilla de 6 semanas del mes visible, así la vista Semana en el borde
  // de mes no queda vacía. (Antes traía solo [primer día, primer día sig. mes).)
  const { start, end } = gridRange(new Date(date + "T00:00:00"));

  const supabase = await createClient();
  const profile = await getProfile();
  const writable = can(profile?.role, "appointments:write");

  const [{ data: appts }, { data: patients }, { data: doctors }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, dentist_name, patient_name, patient_id, reason, consult_price, deposit, deposit_method, patients(full_name, national_id)",
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
    supabase.from("doctors").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeAppointments />
      <h1 className="text-2xl font-bold">Agenda</h1>
      <AgendaShell
        patients={patients ?? []}
        appts={(appts as never) ?? []}
        date={date}
        view={view}
        canWrite={writable}
        doctors={doctors ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 4: Eliminar el monolito**

```bash
git rm components/agenda/AgendaCalendar.tsx
```

- [ ] **Step 5: Verificar tipos y unit tests**

Run: `npm run typecheck && npm test`
Expected: PASS. Si `typecheck` marca un import sin usar o un símbolo faltante, corregir el import correspondiente (causa típica: olvidar mover un helper a `apptHelpers`).

- [ ] **Step 6: Verificación manual (paridad)**

Run: `npm run dev` → abrir http://localhost:3000/agenda
Verificar:
- El toggle muestra Día / Semana / Mes; al hacer clic cambia `?view=` en la URL.
- En Mes se ve el calendario; clic en un día abre la lista (DayTimeline) debajo, igual que antes.
- Crear, editar y cancelar cita funcionan. El buscador encuentra y resalta.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(agenda): AgendaShell + MonthView, vista en URL, fetch a grilla 6 semanas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `DayView` — horario visual con columnas por odontólogo

Reemplaza el `DayTimeline` temporal por el horario visual. Bloques proporcionales, columnas por odontólogo, clic-en-hueco para agendar.

**Files:**
- Create: `components/agenda/DayView.tsx`
- Modify: `components/agenda/AgendaShell.tsx`

- [ ] **Step 1: Crear `components/agenda/DayView.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import {
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  dentistColumns,
  assignLanes,
} from "@/lib/agenda";
import {
  type MonthAppt,
  apptName,
  apptCI,
  isQuickConsult,
  apptBlockStyle,
} from "./apptHelpers";

const PX_PER_HOUR = 56;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i);
const hhmm = (d: Date) =>
  d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

// Fracción del eje (0..1) que corresponde a "ahora", o null si no aplica.
function nowFraction(day: string): number | null {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (key !== day) return null;
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const min = now.getHours() * 60 + now.getMinutes() - OPEN_HOUR * 60;
  if (min < 0 || min > total) return null;
  return min / total;
}

export function DayView({
  day, // YYYY-MM-DD
  appts,
  canWrite,
  highlightId,
  onPick,
  onEdit,
}: {
  day: string;
  appts: MonthAppt[];
  canWrite: boolean;
  highlightId: string | null;
  onPick: (start: Date, end: Date, dentist?: string) => void;
  onEdit: (a: MonthAppt) => void;
}) {
  const [y, m, d] = day.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  // Columnas: una por odontólogo con cita; si hay 0–1, una sola columna ancha.
  const columns = useMemo(() => {
    const names = dentistColumns(appts);
    return names.length > 1 ? names : [null]; // null = columna única
  }, [appts]);

  const now = nowFraction(day);

  // Slots de 30 min para clic-en-hueco.
  const slots = useMemo(() => {
    const out: Date[] = [];
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
      out.push(new Date(y, m - 1, d, h, 0));
      out.push(new Date(y, m - 1, d, h, STEP_MIN));
    }
    return out;
  }, [y, m, d]);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold capitalize text-slate-700">{dayLabel}</h2>
        <span className="text-xs text-slate-400">{appts.length} cita(s)</span>
      </div>

      <div className="flex">
        {/* Eje de horas */}
        <div className="relative w-12 shrink-0" style={{ height: AXIS_H }}>
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
              style={{ top: (i / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Columnas de odontólogo */}
        <div className="flex flex-1 gap-1">
          {columns.map((col) => {
            const colAppts = col === null ? appts : appts.filter((a) => (a.dentist_name?.trim() || "Sin asignar") === col);
            const laid = assignLanes(colAppts);
            return (
              <div key={col ?? "única"} className="flex-1">
                {col !== null && (
                  <div className="mb-1 truncate text-center text-xs font-medium text-slate-500" title={col}>
                    {col}
                  </div>
                )}
                <div className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100" style={{ height: AXIS_H }}>
                  {/* Líneas de hora */}
                  {HOURS.slice(1, -1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: ((i + 1) / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
                    />
                  ))}

                  {/* Slots clicables (fondo) */}
                  {canWrite &&
                    slots.map((s) => {
                      const end = new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, end);
                      return (
                        <button
                          key={s.toISOString()}
                          type="button"
                          onClick={() => onPick(s, end, col ?? undefined)}
                          aria-label={`Agendar ${hhmm(s)}`}
                          className="absolute inset-x-0 z-0 transition hover:bg-green-100/60"
                          style={{ top: g.top * AXIS_H, height: g.height * AXIS_H }}
                        />
                      );
                    })}

                  {/* Línea de "ahora" */}
                  {now !== null && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-400" style={{ top: now * AXIS_H }}>
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  )}

                  {/* Bloques de cita */}
                  {laid.map(({ appt: a, lane, lanes }) => {
                    const s = new Date(a.starts_at);
                    const e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + STEP_MIN * 60_000);
                    const g = blockGeometry(s, e);
                    const isHit = highlightId === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => onEdit(a)}
                        title={canWrite ? "Editar cita" : undefined}
                        className={`absolute z-10 overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] transition enabled:hover:shadow-md disabled:cursor-default ${apptBlockStyle(a.status)} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}
                        style={{
                          top: g.top * AXIS_H,
                          height: Math.max(g.height * AXIS_H, 16),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                        }}
                      >
                        <span className="block tabular-nums opacity-70">{hhmm(s)}</span>
                        <span className={`block truncate font-medium ${a.status === "no_show" ? "line-through" : ""}`}>
                          {apptName(a)}
                        </span>
                        {isQuickConsult(a) && <span className="block text-[10px] text-amber-600">sin registrar</span>}
                        {a.reason && g.height * AXIS_H > 44 && (
                          <span className="block truncate opacity-70">{a.reason}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {appts.length === 0 && (
        <p className="mt-2 text-center text-sm text-slate-500">
          {canWrite ? "Día libre — hacé clic en una franja para agendar." : "Sin citas este día."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Enchufar `DayView` en `AgendaShell` para `view === "day"`**

En `components/agenda/AgendaShell.tsx`:

1. Agregar el import: `import { DayView } from "./DayView";`
2. Ampliar el tipo `ModalState` para llevar el odontólogo precargado (ya está: `dentist?: string`).
3. Reemplazar el bloque de render entre `<MonthView .../>` y el `selectedDay && <DayTimeline/>` por un switch de vista. Sustituir esas dos secciones por:

```tsx
{view === "month" && (
  <>
    <MonthView month={date} byDay={byDay} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
    {selectedDay && (
      <DayView
        day={selectedDay}
        appts={byDay.get(selectedDay) ?? []}
        canWrite={canWrite}
        highlightId={highlightId}
        onPick={(start, end, dentist) => setModal({ start, end, dentist })}
        onEdit={(a) =>
          setModal({
            start: new Date(a.starts_at),
            end: a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
            appt: a,
          })
        }
      />
    )}
  </>
)}

{view === "day" && (
  <DayView
    day={date}
    appts={byDay.get(date) ?? []}
    canWrite={canWrite}
    highlightId={highlightId}
    onPick={(start, end, dentist) => setModal({ start, end, dentist })}
    onEdit={(a) =>
      setModal({
        start: new Date(a.starts_at),
        end: a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
        appt: a,
      })
    }
  />
)}
```

4. Borrar de `AgendaShell.tsx` el componente interno `DayTimeline` (ya no se usa) y su import de `buildTimeline` si quedó huérfano. Dejar `mins`/`STEP_MIN` si siguen en uso.
5. Pasar el odontólogo precargado al modal: en `<ApptModal .../>` agregar la prop `dentist={modal.dentist}`.

- [ ] **Step 3: Aceptar `dentist` en `ApptModal` (precarga del odontólogo)**

En `components/agenda/ApptModal.tsx`:
- Añadir `dentist` a las props: `dentist?: string;`
- En el input de odontólogo, cambiar `defaultValue={appt?.dentist_name ?? ""}` por `defaultValue={appt?.dentist_name ?? dentist ?? ""}`.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Run: `npm run dev` → http://localhost:3000/agenda (abre en Día por defecto)
Verificar:
- Se ve el eje 08–20h y los bloques proporcionales (una cita de 1h se ve el doble que una de 30 min).
- Un día con dos odontólogos muestra dos columnas con su nombre.
- Clic en una franja vacía abre el modal con la hora y, si la columna era de un doctor, su nombre precargado.
- Clic en un bloque abre el modal de edición.
- Si el día es hoy, aparece la línea roja de "ahora".
- Dos citas solapadas del mismo doctor aparecen lado a lado.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agenda): vista Día con horario visual, columnas por odontólogo y clic-en-hueco

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `WeekView` — grilla semanal

**Files:**
- Create: `components/agenda/WeekView.tsx`
- Modify: `components/agenda/AgendaShell.tsx`

- [ ] **Step 1: Crear `components/agenda/WeekView.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import {
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  assignLanes,
  weekDays,
} from "@/lib/agenda";
import { type MonthAppt, apptName, apptBlockStyle } from "./apptHelpers";

const PX_PER_HOUR = 48;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR + 1 }, (_, i) => OPEN_HOUR + i);
const WD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });

export function WeekView({
  date, // YYYY-MM-DD dentro de la semana visible
  byDay,
  canWrite,
  onOpenDay,
  onPick,
  onEdit,
}: {
  date: string;
  byDay: Map<string, MonthAppt[]>;
  canWrite: boolean;
  onOpenDay: (day: string) => void;
  onPick: (start: Date, end: Date) => void;
  onEdit: (a: MonthAppt) => void;
}) {
  const days = useMemo(() => weekDays(new Date(date + "T00:00:00")), [date]);
  const todayKey = dayKey(new Date());

  return (
    <div className="overflow-x-auto rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex min-w-[680px]">
        {/* Eje de horas */}
        <div className="relative w-12 shrink-0" style={{ height: AXIS_H, marginTop: 28 }}>
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-400"
              style={{ top: (i / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* 7 columnas de día */}
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d, idx) => {
            const k = dayKey(d);
            const isToday = k === todayKey;
            const dayAppts = byDay.get(k) ?? [];
            const laid = assignLanes(dayAppts);

            // Slots de 30 min de la columna.
            const slots: Date[] = [];
            for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
              slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0));
              slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, STEP_MIN));
            }

            return (
              <div key={k} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenDay(k)}
                  className={`mb-1 w-full truncate rounded py-1 text-center text-xs font-medium transition hover:bg-clinic/10 ${
                    isToday ? "bg-clinic text-white" : "text-slate-500"
                  }`}
                  title="Ver el día"
                >
                  {WD[idx]} {d.getDate()}
                </button>
                <div className="relative rounded-md bg-slate-50/60 ring-1 ring-slate-100" style={{ height: AXIS_H }}>
                  {HOURS.slice(1, -1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: ((i + 1) / (CLOSE_HOUR - OPEN_HOUR)) * AXIS_H }}
                    />
                  ))}

                  {canWrite &&
                    slots.map((s) => {
                      const end = new Date(s.getTime() + STEP_MIN * 60_000);
                      const g = blockGeometry(s, end);
                      return (
                        <button
                          key={s.toISOString()}
                          type="button"
                          onClick={() => onPick(s, end)}
                          aria-label={`Agendar ${WD[idx]} ${hhmm(s)}`}
                          className="absolute inset-x-0 z-0 transition hover:bg-green-100/60"
                          style={{ top: g.top * AXIS_H, height: g.height * AXIS_H }}
                        />
                      );
                    })}

                  {laid.map(({ appt: a, lane, lanes }) => {
                    const s = new Date(a.starts_at);
                    const e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + STEP_MIN * 60_000);
                    const g = blockGeometry(s, e);
                    const initial = (a.dentist_name?.trim() || "")[0]?.toUpperCase();
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => onEdit(a)}
                        className={`absolute z-10 overflow-hidden rounded border px-1 text-left text-[10px] leading-tight transition enabled:hover:shadow-md disabled:cursor-default ${apptBlockStyle(a.status)}`}
                        style={{
                          top: g.top * AXIS_H,
                          height: Math.max(g.height * AXIS_H, 14),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                        }}
                        title={`${hhmm(s)} ${apptName(a)}${a.dentist_name ? " · " + a.dentist_name : ""}`}
                      >
                        <span className={`block truncate font-medium ${a.status === "no_show" ? "line-through" : ""}`}>
                          {initial ? `${initial}· ` : ""}{apptName(a)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Enchufar `WeekView` en `AgendaShell` para `view === "week"`**

En `components/agenda/AgendaShell.tsx`:
1. `import { WeekView } from "./WeekView";`
2. Agregar, junto a los otros bloques de vista:

```tsx
{view === "week" && (
  <WeekView
    date={date}
    byDay={byDay}
    canWrite={canWrite}
    onOpenDay={(k) => router.push(`/agenda?date=${k}&view=day`)}
    onPick={(start, end) => setModal({ start, end })}
    onEdit={(a) =>
      setModal({
        start: new Date(a.starts_at),
        end: a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + STEP_MIN * 60_000),
        appt: a,
      })
    }
  />
)}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` → cambiar a la vista Semana.
Verificar:
- 7 columnas lun–dom; hoy resaltado en el encabezado.
- Las citas aparecen como bloques en su día/hora; con varios odontólogos, cada bloque lleva la inicial.
- Clic en el encabezado de un día → salta a vista Día de esa fecha.
- Clic en un hueco → modal con esa fecha/hora.
- "← →" mueve de semana en semana; "Hoy" vuelve a la semana actual.
- En pantalla angosta, la grilla hace scroll horizontal (no se aplasta).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agenda): vista Semana con 7 columnas y navegación a Día

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Pulido — popover de asistencia híbrido en `DayView`

Los controles Atendido / No vino / Vincular: dentro del bloque si la cita es ≥45 min; en popover (hover en desktop / clic en el icono ⋯ en touch) si es chica. Para no duplicar lógica, se centraliza en un componente `ApptActions`.

**Files:**
- Create: `components/agenda/ApptActions.tsx`
- Modify: `components/agenda/DayView.tsx`

- [ ] **Step 1: Crear `components/agenda/ApptActions.tsx`**

Agrupa `MiniStatus` y el botón "Vincular" en un contenedor reutilizable.

```tsx
"use client";

import { MiniStatus } from "./MiniStatus";
import { type MonthAppt, isQuickConsult } from "./apptHelpers";

export function ApptActions({
  appt,
  canWrite,
  onLink,
  compact = false,
}: {
  appt: MonthAppt;
  canWrite: boolean;
  onLink: (a: MonthAppt) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 ${compact ? "flex-wrap" : ""}`}>
      <MiniStatus id={appt.id} status={appt.status} canWrite={canWrite} />
      {canWrite && isQuickConsult(appt) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLink(appt);
          }}
          className="rounded border border-clinic px-1.5 py-0.5 text-[10px] font-medium text-clinic hover:bg-clinic hover:text-white"
        >
          Vincular
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mostrar acciones híbridas en `DayView`**

En `components/agenda/DayView.tsx`:
1. Añadir la prop `onLink: (a: MonthAppt) => void;` a `DayView` (y propagarla desde `AgendaShell` — paso 3).
2. Importar: `import { ApptActions } from "./ApptActions";`
3. Para cada bloque de cita, calcular `const tall = g.height * AXIS_H >= 90; // ≈45 min` y:
   - Si `tall`: renderizar `<div className="mt-1" onClick={(e)=>e.stopPropagation()}><ApptActions appt={a} canWrite={canWrite} onLink={onLink} compact /></div>` dentro del bloque, debajo del nombre.
   - Si NO `tall`: renderizar las acciones en un popover que aparece al hover. Envolver el bloque en un contenedor `group` y agregar, como hermano del `<button>` del bloque, un panel posicionado:

```tsx
{!tall && canWrite && (
  <div
    className="absolute z-30 hidden group-hover:flex"
    style={{
      top: g.top * AXIS_H,
      left: `calc(${(lane / lanes) * 100}% )`,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="ml-1 rounded-md bg-white p-1 shadow-lg ring-1 ring-slate-200">
      <ApptActions appt={a} canWrite={canWrite} onLink={onLink} />
    </div>
  </div>
)}
```

   Para que el `group-hover` funcione, envolver cada bloque (el `<button>` y su popover) en un `<div key={a.id} className="group absolute" style={{top,height,left,width}}>` y mover los estilos de posición al wrapper, dejando el `<button>` con `className="h-full w-full ..."` y `relative`. Ajustar el popover a `top: 0; left: 100%` relativo al wrapper.

> Implementación concreta del wrapper (reemplaza el `<button>` de bloque del paso de Task 8):

```tsx
<div
  key={a.id}
  className="group absolute z-10"
  style={{
    top: g.top * AXIS_H,
    height: Math.max(g.height * AXIS_H, 16),
    left: `${(lane / lanes) * 100}%`,
    width: `${(1 / lanes) * 100}%`,
  }}
>
  <button
    type="button"
    disabled={!canWrite}
    onClick={() => onEdit(a)}
    title={canWrite ? "Editar cita" : undefined}
    className={`flex h-full w-full flex-col overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] transition enabled:hover:shadow-md disabled:cursor-default ${apptBlockStyle(a.status)} ${isHit ? "animate-flash ring-2 ring-clinic" : ""}`}
  >
    <span className="tabular-nums opacity-70">{hhmm(s)}</span>
    <span className={`truncate font-medium ${a.status === "no_show" ? "line-through" : ""}`}>{apptName(a)}</span>
    {isQuickConsult(a) && <span className="text-[10px] text-amber-600">sin registrar</span>}
    {tall && (
      <div className="mt-auto pt-1" onClick={(e) => e.stopPropagation()}>
        <ApptActions appt={a} canWrite={canWrite} onLink={onLink} compact />
      </div>
    )}
  </button>
  {!tall && canWrite && (
    <div className="absolute left-full top-0 z-30 hidden group-hover:block" onClick={(e) => e.stopPropagation()}>
      <div className="ml-1 rounded-md bg-white p-1 shadow-lg ring-1 ring-slate-200">
        <ApptActions appt={a} canWrite={canWrite} onLink={onLink} />
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Propagar `onLink` desde `AgendaShell`**

En `AgendaShell.tsx`, en los dos usos de `<DayView .../>` (vista Día y dentro de Mes), agregar `onLink={(a) => setLinkAppt(a)}`.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Run: `npm run dev` → vista Día.
Verificar:
- Una cita de 1h muestra los botones Atendido / No vino dentro del bloque.
- Una cita de 30 min los muestra en un panel al pasar el mouse.
- "Vincular" aparece solo en consultas rápidas; al usarlo se abre el modal de vínculo.
- Marcar Atendido / No vino / deshacer sigue funcionando (refresca en vivo).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agenda): acciones de asistencia híbridas (en bloque / popover) en vista Día

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Regresión final E2E + typecheck

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite unitaria completa**

Run: `npm test`
Expected: PASS (los 68 previos + los nuevos de Tasks 1–4).

- [ ] **Step 2: Typecheck y lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS / sin errores.

- [ ] **Step 3: E2E**

Run: `npm run test:e2e`
Expected: PASS. Si `e2e/agenda.spec.ts` falla porque dependía del DOM del calendario viejo (lista del día), actualizar los selectores del spec a la nueva vista Día (bloques con `aria-label`/texto del paciente) — ajustar el test, NO el componente, salvo que revele un bug real.

- [ ] **Step 4: Commit (si hubo ajustes de E2E)**

```bash
git add -A
git commit -m "test(agenda): actualizar E2E a las nuevas vistas Día/Semana

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de diseño y decisiones

- **Sin cambios de BD ni de server actions.** `createAppointment`, `updateAppointment`, `cancelAppointment`, `setAppointmentStatus`, `linkAppointmentPatient` se reutilizan tal cual. Día/Semana solo cambian la presentación.
- **Hora local en todo.** La geometría usa `getHours()/getMinutes()` (hora local), coherente con `buildTimeline` y los tests existentes. El modal sigue enviando el offset `-04:00` explícito como hoy.
- **Rango de fetch ampliado** (grilla de 6 semanas) sirve a las tres vistas: Mes usa todo, Semana usa su semana, Día su día. Cambiar de mes/semana fuera del rango recarga vía URL (misma mecánica que hoy).
- **YAGNI:** sin drag & drop, sin persistir preferencia de vista por usuario (vive en la URL), sin columnas por odontólogo en Semana (se delega a Día).
```
