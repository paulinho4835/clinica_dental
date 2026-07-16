# Disponibilidad de doctores (addon `disponibilidad`) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo para registrar cuándo NO atiende cada doctor (semanal recurrente + fechas puntuales), reflejado en gris en la agenda, con advertencia al agendar encima, consultable/imprimible por el admin, y respetado por el Agente de IA.

**Architecture:** Tabla `doctor_availability` (bloques de NO disponibilidad por doctor), lógica pura en `lib/availability.ts`, página nueva `/disponibilidad` (addon opt-in, editan admin y recepcionista), overlay gris en DayView/WeekView reutilizando `blockGeometry`, advertencia no bloqueante en el modal/popover de cita, y resta de bloques en `check_availability`/`book_appointment` del agente.

**Tech Stack:** Next.js App Router, Supabase (migración + RLS), Vitest, Tailwind + primitivos `components/ui/`, AI SDK (tools del agente en `lib/agent/tools.ts`).

**Spec:** `docs/superpowers/specs/2026-07-16-disponibilidad-doctores-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo).
- NUNCA hacer push sin autorización explícita del usuario. Commits sí, push no.
- Zona horaria: los bloques son hora de Bolivia (UTC-4). Los `Date` se construyen con offset explícito `-04:00`; nunca depender del huso del dispositivo. Weekday 0 = lunes (igual que `gridRange`/`weekDays` en `lib/agenda.ts`).
- La advertencia al agendar NO bloquea: informa y deja continuar.
- Con el addon `disponibilidad` apagado: cero cambios de comportamiento (agenda, modal y agente idénticos a hoy).
- Aislamiento por clínica explícito en cada query (`.eq("clinic_id", ...)`), además de RLS.
- Migración `0090` (la `0089` está reservada por el plan de permisos_equipo).
- Usar primitivos de `components/ui/`, `cn()`, `toast()`, `confirm()` según patrón del repo.
- Typecheck `npx tsc --noEmit`; tests `npm test`.

---

### Task 1: Lógica pura `lib/availability.ts` (TDD)

**Files:**
- Create: `lib/availability.ts`
- Test: `tests/disponibilidad.test.ts` (nuevo)

**Interfaces:**
- Produces (consumido por Tasks 3–6):

```typescript
export type AvailabilityBlock = {
  id: string;
  dentist_id: string;
  dentist_name: string;          // full_name del join a profiles
  weekday: number | null;        // 0=lunes … 6=domingo; exclusivo con date_from
  date_from: string | null;      // YYYY-MM-DD
  date_to: string | null;        // YYYY-MM-DD
  start_time: string;            // "HH:MM" (o "HH:MM:SS" de postgres; se normaliza)
  end_time: string;
  reason: string | null;
};
export function boliviaWeekdayOf(dayISO: string): number;
export function blocksForDay(dayISO: string, blocks: AvailabilityBlock[]): AvailabilityBlock[];
export function blockRange(dayISO: string, b: AvailabilityBlock): { start: Date; end: Date };
export function findAvailabilityConflict(
  dayISO: string,
  start: Date,
  end: Date,
  dentistName: string | null | undefined,
  blocks: AvailabilityBlock[],
): AvailabilityBlock | null;
```

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/disponibilidad.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  boliviaWeekdayOf,
  blocksForDay,
  blockRange,
  findAvailabilityConflict,
  type AvailabilityBlock,
} from "@/lib/availability";

const base = {
  id: "b1",
  dentist_id: "d1",
  dentist_name: "Ana Pérez",
  weekday: null as number | null,
  date_from: null as string | null,
  date_to: null as string | null,
  start_time: "09:00",
  end_time: "13:00",
  reason: null as string | null,
};

describe("boliviaWeekdayOf", () => {
  it("0 = lunes", () => {
    expect(boliviaWeekdayOf("2026-07-13")).toBe(0); // lunes
    expect(boliviaWeekdayOf("2026-07-16")).toBe(3); // jueves
    expect(boliviaWeekdayOf("2026-07-19")).toBe(6); // domingo
  });
});

describe("blocksForDay", () => {
  const weekly: AvailabilityBlock = { ...base, weekday: 0 }; // lunes
  const dated: AvailabilityBlock = {
    ...base,
    id: "b2",
    date_from: "2026-08-01",
    date_to: "2026-08-10",
  };

  it("matchea el semanal solo en su día de semana", () => {
    expect(blocksForDay("2026-07-13", [weekly])).toEqual([weekly]); // lunes
    expect(blocksForDay("2026-07-14", [weekly])).toEqual([]);       // martes
  });

  it("matchea el rango de fechas inclusive en los bordes", () => {
    expect(blocksForDay("2026-08-01", [dated])).toEqual([dated]);
    expect(blocksForDay("2026-08-10", [dated])).toEqual([dated]);
    expect(blocksForDay("2026-08-11", [dated])).toEqual([]);
    expect(blocksForDay("2026-07-31", [dated])).toEqual([]);
  });

  it("normaliza HH:MM:SS de postgres", () => {
    const pg = { ...base, weekday: 0, start_time: "09:00:00", end_time: "13:00:00" };
    const [b] = blocksForDay("2026-07-13", [pg]);
    expect(blockRange("2026-07-13", b).start.toISOString()).toBe(
      new Date("2026-07-13T09:00:00-04:00").toISOString(),
    );
  });
});

describe("blockRange", () => {
  it("construye instantes en hora Bolivia (-04:00), no del dispositivo", () => {
    const { start, end } = blockRange("2026-07-13", { ...base, weekday: 0 });
    expect(start.toISOString()).toBe(new Date("2026-07-13T09:00:00-04:00").toISOString());
    expect(end.toISOString()).toBe(new Date("2026-07-13T13:00:00-04:00").toISOString());
  });
});

describe("findAvailabilityConflict", () => {
  const weekly: AvailabilityBlock = { ...base, weekday: 0, reason: "No viene" }; // lunes 9-13

  it("detecta solapamiento parcial (cita 08:30-09:30)", () => {
    const s = new Date("2026-07-13T08:30:00-04:00");
    const e = new Date("2026-07-13T09:30:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Ana Pérez", [weekly])?.id).toBe("b1");
  });

  it("sin conflicto si la cita toca el borde exacto (13:00-14:00)", () => {
    const s = new Date("2026-07-13T13:00:00-04:00");
    const e = new Date("2026-07-13T14:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Ana Pérez", [weekly])).toBeNull();
  });

  it("sin conflicto para otro doctor u otro día", () => {
    const s = new Date("2026-07-13T10:00:00-04:00");
    const e = new Date("2026-07-13T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Luis Rojas", [weekly])).toBeNull();
    const mar = new Date("2026-07-14T10:00:00-04:00");
    const marE = new Date("2026-07-14T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-14", mar, marE, "Ana Pérez", [weekly])).toBeNull();
  });

  it("sin nombre de doctor no hay conflicto (no es atribuible)", () => {
    const s = new Date("2026-07-13T10:00:00-04:00");
    const e = new Date("2026-07-13T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, null, [weekly])).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/disponibilidad.test.ts`
Expected: FAIL — módulo `@/lib/availability` no existe.

- [ ] **Step 3: Implementar `lib/availability.ts`**

```typescript
// Lógica pura de disponibilidad de doctores (addon "disponibilidad").
// Un AvailabilityBlock es un rango donde el doctor NO atiende: semanal
// recurrente (weekday 0=lunes) o por fechas (date_from..date_to inclusive).
// Sin React/DOM para poder testearla aislada (mismo criterio que lib/agenda.ts).

export type AvailabilityBlock = {
  id: string;
  dentist_id: string;
  dentist_name: string;
  weekday: number | null;
  date_from: string | null;
  date_to: string | null;
  start_time: string; // "HH:MM" o "HH:MM:SS" (postgres time)
  end_time: string;
  reason: string | null;
};

// Día de semana de una fecha-calendario YYYY-MM-DD con 0=lunes…6=domingo.
// La fecha es de calendario (no un instante), así que el cálculo es puro.
export function boliviaWeekdayOf(dayISO: string): number {
  const [y, m, d] = dayISO.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

const hhmm = (t: string) => t.slice(0, 5);

// Bloques que aplican a un día concreto (semanales por weekday + por fechas).
export function blocksForDay(
  dayISO: string,
  blocks: AvailabilityBlock[],
): AvailabilityBlock[] {
  const wd = boliviaWeekdayOf(dayISO);
  return blocks.filter((b) => {
    if (b.weekday !== null) return b.weekday === wd;
    if (b.date_from && b.date_to) return b.date_from <= dayISO && dayISO <= b.date_to;
    return false;
  });
}

// Instantes reales del bloque en un día dado, en hora Bolivia (-04:00) para no
// depender del huso del dispositivo (mismo criterio que boliviaMinutesOfDay).
export function blockRange(
  dayISO: string,
  b: AvailabilityBlock,
): { start: Date; end: Date } {
  return {
    start: new Date(`${dayISO}T${hhmm(b.start_time)}:00-04:00`),
    end: new Date(`${dayISO}T${hhmm(b.end_time)}:00-04:00`),
  };
}

// Primer bloque del doctor que se solapa con [start, end). Bordes exactos no
// chocan (cita 13:00 con bloque hasta 13:00 = ok). Sin doctor no es atribuible.
export function findAvailabilityConflict(
  dayISO: string,
  start: Date,
  end: Date,
  dentistName: string | null | undefined,
  blocks: AvailabilityBlock[],
): AvailabilityBlock | null {
  const name = dentistName?.trim();
  if (!name) return null;
  for (const b of blocksForDay(dayISO, blocks)) {
    if (b.dentist_name.trim() !== name) continue;
    const r = blockRange(dayISO, b);
    if (r.start < end && r.end > start) return b;
  }
  return null;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/disponibilidad.test.ts && npx tsc --noEmit`
Expected: PASS todos; typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/availability.ts tests/disponibilidad.test.ts
git commit -m "feat(disponibilidad): lógica pura de bloques de no disponibilidad"
```

---

### Task 2: Migración 0090 + addon + whitelist

**Files:**
- Create: `supabase/migrations/0090_doctor_availability.sql`
- Modify: `lib/features.ts` (clave `disponibilidad`)
- Modify: `lib/rbac.ts` (whitelist admin + recepcionista)

**Interfaces:**
- Produces: tabla `doctor_availability`; `FeatureKey` incluye `"disponibilidad"`; `canSeeNav("admin"|"recepcionista", "disponibilidad") === true`.

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/0090_doctor_availability.sql`:

```sql
-- Addon "disponibilidad": bloques donde un doctor NO atiende.
-- Dos formas, mismo registro: semanal recurrente (weekday 0=lunes…6=domingo)
-- o por fechas (date_from..date_to inclusive). El horario general de la
-- clínica (08-20) no cambia; esto registra excepciones.
create table doctor_availability (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  dentist_id uuid not null references profiles(id) on delete cascade,
  weekday smallint check (weekday between 0 and 6),
  date_from date,
  date_to date,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Exactamente una de las dos formas.
  constraint da_weekly_xor_dated check ((weekday is not null) <> (date_from is not null)),
  -- Rango de fechas completo y coherente.
  constraint da_date_range check (date_from is null or (date_to is not null and date_to >= date_from)),
  constraint da_time_range check (end_time > start_time)
);

create index doctor_availability_clinic_dentist
  on doctor_availability (clinic_id, dentist_id);

alter table doctor_availability enable row level security;

-- Lectura: toda la clínica (doctores ven sus bloques grises en la agenda).
create policy doctor_availability_select on doctor_availability for select
  using (clinic_id = (select auth_clinic_id()));

-- Escritura: admin Y recepcionista (el doctor avisa, la recepción registra).
create policy doctor_availability_write on doctor_availability for all
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  );
```

- [ ] **Step 2: Aplicar en local y verificar**

Run: aplicar con `docker exec -i supabase_db_dentalsaas psql -U postgres -d postgres < supabase/migrations/0090_doctor_availability.sql`
Expected: sin errores. Verificar checks: un insert con `weekday` y `date_from` a la vez debe fallar.

Nota prod: se aplica a mano por el dashboard de Supabase (CLI logueado con otra cuenta). Anotar como pendiente al cerrar la rama.

- [ ] **Step 3: Clave del addon en `lib/features.ts`**

En `FeatureKey`, después de `| "aviso_doctores"`:

```typescript
  | "disponibilidad"
```

En `FEATURES`, después de la entrada de `aviso_doctores`:

```typescript
  // Addon: disponibilidad de doctores. Registra cuándo NO atiende cada doctor
  // (semanal o por fechas); se pinta gris en la agenda, avisa al agendar encima
  // y el Agente de IA no ofrece esos horarios.
  { key: "disponibilidad", label: "Disponibilidad de doctores", href: "/disponibilidad", optIn: true },
```

- [ ] **Step 4: Whitelist en `lib/rbac.ts`**

En `NAV_WHITELIST`, agregar `"disponibilidad"` a `admin` y a `recepcionista` (solo esos dos roles; doctores/asistentes no ven la página, aunque sí el gris en su agenda).

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: limpio (los tests de permisos, si ya existen en la rama, no se ven afectados: `disponibilidad` no entra en sus expectativas de `hideableModules` para roles no-recepcionista).

Si `tests/permisos.test.ts` ya existe y algún test de `hideableModules("recepcionista")` fija lista exacta, actualizar esa expectativa agregando `"disponibilidad"`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0090_doctor_availability.sql lib/features.ts lib/rbac.ts
git commit -m "feat(disponibilidad): tabla doctor_availability + addon + whitelist"
```

---

### Task 3: Página `/disponibilidad` (actions + panel)

**Files:**
- Create: `app/(dashboard)/disponibilidad/actions.ts`
- Create: `app/(dashboard)/disponibilidad/page.tsx`
- Create: `components/disponibilidad/AvailabilityPanel.tsx`

**Interfaces:**
- Consumes: `AvailabilityBlock`, `blocksForDay` (Task 1); tabla y addon (Task 2).
- Produces: actions `createAvailabilityBlock(input)` / `deleteAvailabilityBlock(id)` con retorno `{ ok?: true; error?: string }`.

- [ ] **Step 1: Server actions**

Crear `app/(dashboard)/disponibilidad/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

const EDIT_ROLES = new Set(["admin", "recepcionista"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NewBlock = {
  dentistId: string;
  mode: "weekly" | "dated";
  weekday?: number;      // requerido si weekly (0=lunes)
  dateFrom?: string;     // requeridos si dated
  dateTo?: string;
  startTime: string;     // "HH:MM"
  endTime: string;
  reason?: string;
};

async function guard() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile || !EDIT_ROLES.has(profile.role)) return { error: "Sin permisos." as const };
  if (!features.disponibilidad)
    return { error: "El módulo de disponibilidad no está habilitado." as const };
  return { profile };
}

export async function createAvailabilityBlock(
  input: NewBlock,
): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ("error" in g) return g;

  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime))
    return { error: "Horario inválido." };
  if (input.endTime <= input.startTime)
    return { error: "La hora fin debe ser mayor que la de inicio." };

  const row: Record<string, unknown> = {
    clinic_id: g.profile.clinicId,
    dentist_id: input.dentistId,
    start_time: input.startTime,
    end_time: input.endTime,
    reason: input.reason?.trim() || null,
    created_by: g.profile.userId,
  };

  if (input.mode === "weekly") {
    if (input.weekday == null || input.weekday < 0 || input.weekday > 6)
      return { error: "Día de semana inválido." };
    row.weekday = input.weekday;
  } else {
    if (!DATE_RE.test(input.dateFrom ?? "") || !DATE_RE.test(input.dateTo ?? ""))
      return { error: "Fechas inválidas." };
    if ((input.dateTo ?? "") < (input.dateFrom ?? ""))
      return { error: "La fecha fin debe ser igual o posterior a la de inicio." };
    row.date_from = input.dateFrom;
    row.date_to = input.dateTo;
  }

  const supabase = await createClient();
  // El doctor debe ser de la clínica (defensa además de RLS + FK).
  const { data: doc } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", input.dentistId)
    .eq("clinic_id", g.profile.clinicId)
    .single();
  if (!doc) return { error: "Doctor no encontrado." };

  const { error } = await supabase.from("doctor_availability").insert(row);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/disponibilidad");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function deleteAvailabilityBlock(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ("error" in g) return g;

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_availability")
    .delete()
    .eq("id", id)
    .eq("clinic_id", g.profile.clinicId);
  if (error) return { error: "No se pudo eliminar." };

  revalidatePath("/disponibilidad");
  revalidatePath("/agenda");
  return { ok: true };
}
```

- [ ] **Step 2: Server page**

Crear `app/(dashboard)/disponibilidad/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireNavAccess } from "@/lib/guard";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import type { AvailabilityBlock } from "@/lib/availability";
import { AvailabilityPanel } from "@/components/disponibilidad/AvailabilityPanel";

export const dynamic = "force-dynamic";

export default async function DisponibilidadPage() {
  await requireNavAccess("disponibilidad");
  const supabase = await createClient();
  const profile = await getProfile();
  const platformAdminIds = await getPlatformAdminIds();

  // Mismo criterio de "doctores" que la agenda: roles que atienden pacientes,
  // activos, sin superadmins.
  let doctorsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "colega", "admin"])
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  const [{ data: doctors }, { data: rows }] = await Promise.all([
    doctorsQuery,
    supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles(full_name)",
      )
      .eq("clinic_id", profile!.clinicId)
      .order("weekday", { ascending: true, nullsFirst: false })
      .order("date_from", { ascending: true }),
  ]);

  const blocks: AvailabilityBlock[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    dentist_id: r.dentist_id as string,
    dentist_name:
      ((r.profiles as { full_name?: string } | null)?.full_name ?? "").trim(),
    weekday: (r.weekday as number | null) ?? null,
    date_from: (r.date_from as string | null) ?? null,
    date_to: (r.date_to as string | null) ?? null,
    start_time: r.start_time as string,
    end_time: r.end_time as string,
    reason: (r.reason as string | null) ?? null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Disponibilidad de doctores</h1>
      <p className="max-w-2xl text-sm text-slate-500">
        Registra los horarios en los que un doctor NO atiende (un día de la
        semana de forma recurrente, o fechas concretas como vacaciones). Esos
        bloques se muestran en gris en la agenda y avisan al agendar encima.
      </p>
      <AvailabilityPanel doctors={doctors ?? []} blocks={blocks} />
    </div>
  );
}
```

Nota: el embed `profiles(full_name)` usa la FK `dentist_id → profiles`. Si PostgREST se queja de ambigüedad por la segunda FK (`created_by`), usar el hint explícito: `profiles!doctor_availability_dentist_id_fkey(full_name)`.

- [ ] **Step 3: Panel client**

Crear `components/disponibilidad/AvailabilityPanel.tsx`. Contenido: tres zonas —
(a) formulario de alta, (b) grilla semanal doctores × días, (c) lista con borrar
y filtros. Código completo:

```typescript
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  type NewBlock,
} from "@/app/(dashboard)/disponibilidad/actions";
import type { AvailabilityBlock } from "@/lib/availability";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/cn";
import { Printer, Trash2 } from "lucide-react";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ALL_DAY = { start: "08:00", end: "20:00" }; // horario general de la clínica

type Doctor = { id: string; full_name: string };

const hhmm = (t: string) => t.slice(0, 5);

function blockLabel(b: AvailabilityBlock): string {
  const when =
    b.weekday !== null
      ? `Todos los ${WEEKDAYS[b.weekday].toLowerCase()}`
      : b.date_from === b.date_to
        ? b.date_from!
        : `${b.date_from} → ${b.date_to}`;
  const time =
    hhmm(b.start_time) === ALL_DAY.start && hhmm(b.end_time) === ALL_DAY.end
      ? "todo el día"
      : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`;
  return `${when}, ${time}`;
}

export function AvailabilityPanel({
  doctors,
  blocks,
}: {
  doctors: Doctor[];
  blocks: AvailabilityBlock[];
}) {
  const [filterDoctor, setFilterDoctor] = useState<string>("");
  const [filterDay, setFilterDay] = useState<string>("");

  const filtered = useMemo(
    () =>
      blocks.filter(
        (b) =>
          (!filterDoctor || b.dentist_id === filterDoctor) &&
          (filterDay === "" || b.weekday === Number(filterDay)),
      ),
    [blocks, filterDoctor, filterDay],
  );

  return (
    <div className="space-y-8">
      <AddBlockForm doctors={doctors} />

      {/* ── Grilla semanal (recurrentes) — imprimible ─────────────────────── */}
      <section className="print-area">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Semana típica</h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">Doctor</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="px-3 py-2 font-medium">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-3 py-2 font-medium text-slate-700">{doc.full_name}</td>
                  {WEEKDAYS.map((_, wd) => {
                    const dayBlocks = blocks.filter(
                      (b) => b.dentist_id === doc.id && b.weekday === wd,
                    );
                    return (
                      <td key={wd} className="px-3 py-2 align-top">
                        {dayBlocks.length === 0 ? (
                          <span className="text-xs text-emerald-600">Disponible</span>
                        ) : (
                          dayBlocks.map((b) => (
                            <div key={b.id} className="text-xs text-slate-500">
                              <span className="font-medium text-slate-600">
                                {hhmm(b.start_time)}–{hhmm(b.end_time)}
                              </span>{" "}
                              no disponible
                              {b.reason ? ` · ${b.reason}` : ""}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {doctors.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-sm text-slate-500">
                    No hay doctores activos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lista completa con filtros y borrar ──────────────────────────── */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Bloques registrados</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className="rounded-lg border-slate-200 text-sm"
          >
            <option value="">Todos los doctores</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
          <select
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="rounded-lg border-slate-200 text-sm"
          >
            <option value="">Todos los días</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {filtered.map((b) => (
              <BlockRow key={b.id} block={b} />
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">
                Sin bloques registrados{filterDoctor || filterDay ? " con esos filtros" : ""}.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BlockRow({ block }: { block: AvailabilityBlock }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function remove() {
    const ok = await confirm({
      title: "Eliminar bloque",
      message: `¿Eliminar "${blockLabel(block)}" de ${block.dentist_name}?`,
      confirmText: "Sí, eliminar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteAvailabilityBlock(block.id);
      if (res.error) { toast(res.error); return; }
      toast("Bloque eliminado.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <span className="text-sm font-medium text-slate-700">{block.dentist_name}</span>
        <span className="ml-2 text-sm text-slate-500">{blockLabel(block)}</span>
        {block.reason && (
          <span className="ml-2 text-xs italic text-slate-400">{block.reason}</span>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label="Eliminar bloque"
        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddBlockForm({ doctors }: { doctors: Doctor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"weekly" | "dated">("weekly");
  const [dentistId, setDentistId] = useState(doctors[0]?.id ?? "");
  const [weekday, setWeekday] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");

  function submit() {
    const input: NewBlock = {
      dentistId,
      mode,
      weekday: mode === "weekly" ? weekday : undefined,
      dateFrom: mode === "dated" ? dateFrom : undefined,
      dateTo: mode === "dated" ? (dateTo || dateFrom) : undefined,
      startTime: allDay ? ALL_DAY.start : startTime,
      endTime: allDay ? ALL_DAY.end : endTime,
      reason: reason || undefined,
    };
    start(async () => {
      const res = await createAvailabilityBlock(input);
      if (res.error) { toast(res.error); return; }
      toast("Bloque registrado.");
      setReason("");
      router.refresh();
    });
  }

  const valid = dentistId && (mode === "weekly" || dateFrom);

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Registrar no disponibilidad</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          Doctor
          <select
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            className="mt-1 block rounded-lg border-slate-200 text-sm"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Tipo
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "weekly" | "dated")}
            className="mt-1 block rounded-lg border-slate-200 text-sm"
          >
            <option value="weekly">Todas las semanas</option>
            <option value="dated">Fecha concreta / rango</option>
          </select>
        </label>

        {mode === "weekly" ? (
          <label className="text-xs text-slate-500">
            Día
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="mt-1 block rounded-lg border-slate-200 text-sm"
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-xs text-slate-500">
              Desde
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 block rounded-lg border-slate-200 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Hasta (opcional)
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 block rounded-lg border-slate-200 text-sm"
              />
            </label>
          </>
        )}

        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Todo el día
        </label>

        {!allDay && (
          <>
            <label className="text-xs text-slate-500">
              De
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block rounded-lg border-slate-200 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              A
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 block rounded-lg border-slate-200 text-sm"
              />
            </label>
          </>
        )}

        <label className="min-w-40 flex-1 text-xs text-slate-500">
          Motivo (opcional)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacaciones, docencia, etc."
            className="mt-1 block w-full rounded-lg border-slate-200 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={!valid || pending}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium",
            valid && !pending
              ? "bg-night text-white hover:opacity-90"
              : "cursor-not-allowed bg-slate-100 text-slate-400",
          )}
        >
          {pending ? "Guardando..." : "Agregar"}
        </button>
      </div>
    </section>
  );
}
```

Nota para el implementador: ajustar firmas de `toast()`/`confirm()` y clases de
inputs al patrón real del repo (mirar `components/ajustes/ReceptionistasPanel.tsx`
como referencia de formulario simple con action).

- [ ] **Step 4: Verificar typecheck + prueba manual**

Run: `npx tsc --noEmit`
Manual: encender el addon para la clínica seed
(`update clinics set features = coalesce(features,'{}'::jsonb) || '{"disponibilidad": true}'::jsonb where name ilike '%sonrisa%';`),
login recepción (`recepcion@sonrisa.com`), crear un bloque semanal (lunes 9–13)
y uno por fecha; verificar grilla, filtros, borrar e imprimir. Login doctor:
`/disponibilidad` redirige a `/agenda`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/disponibilidad" components/disponibilidad
git commit -m "feat(disponibilidad): página /disponibilidad con alta, grilla semanal y filtros"
```

---

### Task 4: Gris en la agenda (DayView + WeekView)

**Files:**
- Create: `components/agenda/UnavailableOverlay.tsx`
- Modify: `app/(dashboard)/agenda/page.tsx` (fetch de bloques + prop)
- Modify: `components/agenda/AgendaShell.tsx` (prop `availability`, pasar a vistas)
- Modify: `components/agenda/DayView.tsx` (overlay por columna)
- Modify: `components/agenda/WeekView.tsx` (overlay solo con doctor filtrado)

**Interfaces:**
- Consumes: `AvailabilityBlock`, `blocksForDay`, `blockRange` (Task 1).
- Produces: prop `availability: AvailabilityBlock[]` en `AgendaShell` (default `[]`).

- [ ] **Step 1: Crear el overlay reutilizable**

Crear `components/agenda/UnavailableOverlay.tsx`:

```typescript
"use client";

import { blockGeometry } from "@/lib/agenda";
import {
  blocksForDay,
  blockRange,
  type AvailabilityBlock,
} from "@/lib/availability";

// Franjas grises "no disponible" dentro de un carril de la agenda.
// pointer-events-none: el gris informa pero no impide clicar la franja para
// agendar (la advertencia al agendar es la que avisa; decisión de diseño:
// advertir, no bloquear). z-[5]: sobre los slots clicables (z-0) y las líneas
// de hora, debajo de las citas (z-10).
export function UnavailableOverlay({
  day,
  dentistName,
  blocks,
  axisH,
}: {
  day: string;
  dentistName: string | null;
  blocks: AvailabilityBlock[];
  axisH: number;
}) {
  if (!dentistName) return null;
  const todays = blocksForDay(day, blocks).filter(
    (b) => b.dentist_name.trim() === dentistName.trim(),
  );
  if (todays.length === 0) return null;

  return (
    <>
      {todays.map((b) => {
        const r = blockRange(day, b);
        const g = blockGeometry(r.start, r.end);
        const h = g.height * axisH;
        return (
          <div
            key={b.id}
            className="pointer-events-none absolute inset-x-0 z-[5] overflow-hidden rounded-sm bg-slate-300/40 ring-1 ring-inset ring-slate-300/60 dark:bg-slate-500/20"
            style={{
              top: g.top * axisH,
              height: h,
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(100,116,139,0.12) 6px, rgba(100,116,139,0.12) 12px)",
            }}
            title={`No disponible${b.reason ? ` · ${b.reason}` : ""}`}
          >
            {h >= 24 && (
              <span className="block truncate px-1.5 pt-0.5 text-[10px] font-medium text-slate-500">
                No disponible{b.reason ? ` · ${b.reason}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Fetch en `app/(dashboard)/agenda/page.tsx`**

Después del bloque de queries existente, agregar (solo si el addon está ON):

```typescript
  // Bloques de no disponibilidad (addon "disponibilidad"): TODOS los semanales
  // (aplican a cualquier semana) + los por fecha que tocan el rango visible.
  let availability: AvailabilityBlock[] = [];
  if (features.disponibilidad && profile) {
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    const { data: availRows } = await supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles(full_name)",
      )
      .eq("clinic_id", profile.clinicId)
      .or(`weekday.not.is.null,and(date_from.lte.${endISO},date_to.gte.${startISO})`);
    availability = (availRows ?? []).map((r) => ({
      id: r.id as string,
      dentist_id: r.dentist_id as string,
      dentist_name:
        ((r.profiles as { full_name?: string } | null)?.full_name ?? "").trim(),
      weekday: (r.weekday as number | null) ?? null,
      date_from: (r.date_from as string | null) ?? null,
      date_to: (r.date_to as string | null) ?? null,
      start_time: r.start_time as string,
      end_time: r.end_time as string,
      reason: (r.reason as string | null) ?? null,
    }));
  }
```

Import: `import type { AvailabilityBlock } from "@/lib/availability";` — y pasar
`availability={availability}` a `<AgendaShell />`.

(El mapeo fila→`AvailabilityBlock` se repite con Task 3: extraer un helper
`mapAvailabilityRow` exportado desde `lib/availability.ts` y usarlo en ambos
lados. Firma: `mapAvailabilityRow(r: Record<string, unknown>): AvailabilityBlock`.)

- [ ] **Step 3: Prop en `AgendaShell` y render en `DayView`**

`AgendaShell`: agregar prop `availability?: AvailabilityBlock[]` (default `[]`)
y pasarla a `DayView` y `WeekView` (leer el componente para ver cómo threadea
`doctors`/`patients` y seguir el mismo patrón; incluye también la vista
"overview" si renderiza `DayView` con `forcedColumns`).

`DayView`: agregar prop `availability?: AvailabilityBlock[]`. Dentro del carril
de cada columna (el `div` con `data-agenda-col`, junto a las líneas divisoras),
renderizar:

```tsx
                    <UnavailableOverlay
                      day={day}
                      dentistName={col}
                      blocks={availability ?? []}
                      axisH={AXIS_H}
                    />
```

(`col` ya es el nombre del doctor de esa columna, o `null` en columna única —
con `null` el overlay no pinta nada, correcto: sin doctor no es atribuible.
Excepción: si `columns` es `[null]` porque solo hay un doctor con citas y la
clínica tiene UN solo doctor en `doctors`, pasar ese nombre en vez de `null`
para que el gris aparezca también en columna única: `dentistName={col ?? (doctors.length === 1 ? doctors[0].full_name : null)}`.)

- [ ] **Step 4: `WeekView` con doctor filtrado**

Leer `components/agenda/WeekView.tsx`. El dropdown de doctor de la agenda ya
filtra `appts` antes de llegar a las vistas (verificar dónde vive ese filtro en
`AgendaShell`). Pasar a `WeekView` la prop `availability` y el nombre del doctor
seleccionado (`selectedDoctor: string | null`); en la columna de cada día,
renderizar `<UnavailableOverlay day={dayISO} dentistName={selectedDoctor} ... />`
con el `axisH` propio de esa vista. Sin doctor seleccionado no se pinta nada.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test`
Manual: con el bloque "lunes 9–13" del Task 3, abrir la agenda en un lunes:
vista Día muestra la franja gris rayada en la columna del doctor; vista Semana
la muestra al filtrar por ese doctor; con el addon apagado no aparece nada.

- [ ] **Step 6: Commit**

```bash
git add components/agenda/UnavailableOverlay.tsx "app/(dashboard)/agenda/page.tsx" components/agenda/AgendaShell.tsx components/agenda/DayView.tsx components/agenda/WeekView.tsx lib/availability.ts
git commit -m "feat(disponibilidad): franjas grises de no disponibilidad en la agenda"
```

---

### Task 5: Advertencia al agendar (ApptModal + QuickCreatePopover)

**Files:**
- Modify: `components/agenda/AgendaShell.tsx` (threading de `availability`)
- Modify: `components/agenda/QuickCreatePopover.tsx`
- Modify: `components/agenda/ApptModal.tsx`

**Interfaces:**
- Consumes: `findAvailabilityConflict` (Task 1), prop `availability` (Task 4).

- [ ] **Step 1: Aviso en `QuickCreatePopover`**

Agregar prop `availability?: AvailabilityBlock[]`. El popover ya conoce
`start`, `end` y el doctor (`dentist` preseleccionado o el select interno si lo
tiene — leer el componente). Calcular:

```typescript
  const dayISO = /* derivar de start en hora Bolivia; usar boliviaTodayISO-style:
     start.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" }) */
  const conflict = findAvailabilityConflict(dayISO, start, end, dentistName, availability ?? []);
```

Y renderizar, encima de los botones de acción:

```tsx
      {conflict && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10">
          ⚠ {conflict.dentist_name} no está disponible en este horario
          {conflict.reason ? ` (${conflict.reason})` : ""}. Puedes agendar igual
          si es una excepción.
        </p>
      )}
```

- [ ] **Step 2: Aviso en `ApptModal`**

Misma mecánica: prop `availability`, recomputar el conflicto de forma reactiva
con los valores actuales del formulario (fecha, hora inicio/fin, doctor
seleccionado) y mostrar el mismo aviso ámbar dentro del formulario. No
deshabilitar el botón de guardar.

- [ ] **Step 3: Threading en `AgendaShell`**

Pasar `availability` a ambos componentes desde `AgendaShell` (y desde `DayView`
al `QuickCreatePopover` que renderiza, si el popover se monta ahí — seguir el
árbol real).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Manual: clic en la franja gris del lunes → popover rápido muestra el aviso ámbar
pero deja crear; "Más opciones" → el modal muestra el mismo aviso; mover la hora
fuera del bloque hace desaparecer el aviso.

- [ ] **Step 5: Commit**

```bash
git add components/agenda/AgendaShell.tsx components/agenda/QuickCreatePopover.tsx components/agenda/ApptModal.tsx components/agenda/DayView.tsx
git commit -m "feat(disponibilidad): advertencia no bloqueante al agendar en bloque no disponible"
```

---

### Task 6: El Agente de IA respeta la disponibilidad

**Files:**
- Modify: `lib/agent/tools.ts`
- Modify: `lib/agent/runAgent.ts` (pasar el flag)

**Interfaces:**
- Consumes: tabla `doctor_availability` (Task 2), `blocksForDay`/`blockRange` (Task 1), `doctorNamesMatch` existente en tools.ts.
- Produces: `buildTools(..., availabilityEnabled?: boolean)`.

- [ ] **Step 1: Flag `availabilityEnabled`**

En `lib/agent/runAgent.ts`, localizar dónde se calculan `canManage` /
`canCheckAvailability` desde las features de la clínica y agregar
`const availabilityEnabled = features.disponibilidad;` pasándolo a `buildTools`.
En `buildTools` (tools.ts, ~línea 258), agregar el parámetro
`availabilityEnabled?: boolean` con default `false`.

- [ ] **Step 2: Helper interno en tools.ts**

Junto a los helpers existentes (`normalizeDate`, `doctorNamesMatch`), agregar:

```typescript
// Bloques de no disponibilidad del día para la clínica (addon "disponibilidad").
// Devuelve [] si el addon está apagado. Cada fila trae el nombre del doctor.
async function fetchDayUnavailability(
  admin: SupabaseClient,
  clinicId: string,
  dayISO: string,
  enabled: boolean,
): Promise<{ dentist_id: string; dentist_name: string; start: Date; end: Date; }[]> {
  if (!enabled) return [];
  const { data } = await admin
    .from("doctor_availability")
    .select("dentist_id, weekday, date_from, date_to, start_time, end_time, profiles(full_name)")
    .eq("clinic_id", clinicId)
    .or(`weekday.not.is.null,and(date_from.lte.${dayISO},date_to.gte.${dayISO})`);
  const wd = (new Date(`${dayISO}T12:00:00-04:00`).getUTCDay() + 6) % 7; // 0=lunes; mediodía evita bordes
  return (data ?? [])
    .filter((r) =>
      r.weekday !== null
        ? r.weekday === wd
        : (r.date_from as string) <= dayISO && dayISO <= (r.date_to as string),
    )
    .map((r) => ({
      dentist_id: r.dentist_id as string,
      dentist_name:
        ((r.profiles as { full_name?: string } | null)?.full_name ?? "").trim(),
      start: new Date(`${dayISO}T${(r.start_time as string).slice(0, 5)}:00-04:00`),
      end: new Date(`${dayISO}T${(r.end_time as string).slice(0, 5)}:00-04:00`),
    }));
}
```

(Nota: si `lib/availability.ts` es importable desde tools.ts sin fricción de
tipos, preferir reusar `boliviaWeekdayOf` en lugar del cálculo inline con
`getUTCDay`; el cálculo debe dar 0=lunes en ambos casos.)

- [ ] **Step 3: Restar bloques en `check_availability`**

En el `execute` de `check_availability` (tools.ts ~línea 367), después de
calcular `intervals` de citas, agregar los bloques como intervalos ocupados:

```typescript
              // Bloques de no disponibilidad del doctor (addon "disponibilidad").
              // Atribuibles solo si hay doctor: el pedido por el paciente, o el
              // que book_appointment auto-asignaría si la clínica tiene uno solo.
              const unavail = await fetchDayUnavailability(admin, clinicId, d, availabilityEnabled ?? false);
              const relevant = doctor_name?.trim()
                ? unavail.filter((u) => doctorNamesMatch(u.dentist_name, doctor_name))
                : uniqueDoctorBlocks(unavail); // ver nota abajo
              for (const u of relevant) {
                intervals.push({ start: u.start.getTime(), end: u.end.getTime() });
              }
```

Nota `uniqueDoctorBlocks`: si el paciente NO pidió doctor, solo restar bloques
cuando la clínica tiene UN solo doctor con bloques atribuibles sin ambigüedad —
implementar como: consultar cuántos doctores activos tiene la clínica (la query
de doctores ya existe en `get_doctors`/`book_appointment`; reusar el mismo
criterio); si es exactamente 1, usar sus bloques; si hay varios, devolver `[]`
(no restar nada: otro doctor podría atender). Dejar comentario explicando esto.

- [ ] **Step 4: Rechazo en `book_appointment` y reagendar**

En `book_appointment` (tools.ts ~línea 513, donde ya se mide el choque contra
el doctor asignado): después de resolver `assignedDoctorId`/nombre y el horario
solicitado, consultar `fetchDayUnavailability` y, si el intervalo de la cita se
solapa con un bloque de ESE doctor:

```typescript
        return `ERROR: la cita NO fue agendada. El Dr./Dra. ${assignedDoctorName} no está disponible el ${d} de ${slice(bloque)} (${motivo ?? "no atiende en ese horario"}).${availabilityHint}`;
```

Mismo patrón en el reagendar de T2 (~línea 716): verificar contra
`appt.dentist_id` y devolver `ERROR: la cita NO fue reprogramada...` si choca.
Respetar las reglas del repo para mensajes del agente: empezar con `ERROR:`,
decir explícitamente qué NO pasó, e incluir la acción correctiva
(`availabilityHint` ya sugiere usar check_availability).

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test`
Manual (local): con el bloque "lunes 9–13" y el addon ON, simular el flujo del
agente (o probar vía el webhook local si está montado): `check_availability` de
un lunes no debe ofrecer 09:00–12:30; `book_appointment` a las 10:00 del lunes
debe devolver `ERROR:` con la sugerencia. Con el addon OFF, comportamiento
idéntico al actual.

- [ ] **Step 6: Commit**

```bash
git add lib/agent/tools.ts lib/agent/runAgent.ts
git commit -m "feat(disponibilidad): el agente de IA descuenta y rechaza horarios no disponibles"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo (verificación + fixes menores).

- [ ] **Step 1: Suite completa + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: todo verde.

- [ ] **Step 2: Addon visible en Superadmin**

Login `super@plataforma.com` → addons de una clínica debe listar
"Disponibilidad de doctores" (sale de `FEATURES`; si hay lista manual, agregarla).

- [ ] **Step 3: Regresión con addon apagado**

Addon OFF: agenda sin gris, modal sin aviso, `/disponibilidad` redirige,
agente idéntico. Menú sin "Disponibilidad de doctores".

- [ ] **Step 4: Matriz de roles**

- Admin y recepcionista: ven y editan `/disponibilidad`.
- Doctor: no ve la página (redirect), SÍ ve el gris en su agenda.
- Asistente: ni página ni item de menú.

- [ ] **Step 5: Registrar pendientes de producción**

- Migración `0090_doctor_availability.sql` a mano por dashboard de Supabase.
- Encender el addon `disponibilidad` a la clínica del admin que lo pidió.
- NO push sin autorización de Paulo.
