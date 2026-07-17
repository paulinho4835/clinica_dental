# Horarios libres (addon `disponibilidad`) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "Horarios libres" en la Agenda que genera un texto (formato
WhatsApp) con los horarios libres de un doctor en los próximos N días, para
que admin/recepción lo copien y peguen al responder consultas de pacientes.

**Architecture:** Lógica pura de cálculo de huecos en `lib/freeSlots.ts`
(reutiliza `buildSlots` de `lib/vapi-helpers.ts` y `blocksForDay`/`blockRange`
de `lib/availability.ts` — el mismo cálculo que ya hace `check_availability`
del agente de IA, sin duplicarlo). Una server action en
`app/(dashboard)/agenda/actions.ts` trae citas + bloques de disponibilidad y
arma el texto. Un modal cliente (`components/agenda/FreeSlotsModal.tsx`)
con selector de doctor/rango, vista previa y botón "Copiar".

**Tech Stack:** Next.js Server Actions, Supabase, Vitest, Tailwind.

## Global Constraints

- Sin migración de base de datos: usa las tablas `appointments` y
  `doctor_availability` ya existentes.
- Gated en `features.disponibilidad` (addon ya existente) + rol
  `admin`/`recepcionista` (mismo criterio que `EDIT_ROLES` de
  `app/(dashboard)/disponibilidad/actions.ts`).
- Duración de cita asumida: 60 min (mismo criterio que `check_availability`
  en `lib/agent/tools.ts`).
- Grilla de horarios: reusa `buildSlots` de `lib/vapi-helpers.ts` tal cual
  (Lun-Sáb 09:00-19:00 cada 30 min, Dom 09:00-11:00) — no se crea una grilla
  nueva.
- Formato del texto (exacto, con emoji y negrita estilo WhatsApp):
  ```
  Estos son los horarios disponibles para programar su cita:

  ✨ *Lunes 13:* 09:00 | 09:30 | 11:00 | 11:30 | 12:00 | 15:00
  ```
  Días sin horarios libres se omiten. Si TODOS los días del rango no tienen
  horarios: `"No hay horarios disponibles en los próximos N días."`

---

### Task 1: Lógica pura de horarios libres

**Files:**
- Create: `lib/freeSlots.ts`
- Test: `tests/freeSlots.test.ts`

**Interfaces:**
- Consumes: `buildSlots(dateISO: string): string[]` de `lib/vapi-helpers.ts`
  (ya existe); `blocksForDay(dayISO, blocks)` y `blockRange(dayISO, block)` y
  `type AvailabilityBlock` de `lib/availability.ts` (ya existen).
- Produces:
  - `freeSlotsForDay(dateISO: string, bookedIntervals: {start: number, end: number}[], availabilityBlocks: AvailabilityBlock[], dentistName: string): string[]`
  - `formatFreeSlotsMessage(days: {dateISO: string, label: string, slots: string[]}[]): string`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/freeSlots.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { freeSlotsForDay, formatFreeSlotsMessage } from "@/lib/freeSlots";
import type { AvailabilityBlock } from "@/lib/availability";

function block(overrides: Partial<AvailabilityBlock> = {}): AvailabilityBlock {
  return {
    id: "b1",
    dentist_id: "doc-1",
    dentist_name: "Dr. Gómez",
    weekday: null,
    date_from: null,
    date_to: null,
    start_time: "09:00",
    end_time: "10:00",
    reason: null,
    ...overrides,
  };
}

// 2026-06-15 es lunes (grilla completa 09:00-19:00, ver tests/vapi-helpers.test.ts).
const MONDAY = "2026-06-15";
// 2026-06-14 es domingo (grilla reducida 09:00-11:00).
const SUNDAY = "2026-06-14";

describe("freeSlotsForDay", () => {
  it("excluye los slots que solapan una cita reservada (60 min)", () => {
    const booked = [
      {
        start: new Date(`${MONDAY}T09:00:00-04:00`).getTime(),
        end: new Date(`${MONDAY}T10:00:00-04:00`).getTime(),
      },
    ];
    const slots = freeSlotsForDay(MONDAY, booked, [], "Dr. Gómez");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00"); // borde exacto: no bloquea
  });

  it("excluye los slots cubiertos por un bloque de no disponibilidad del doctor", () => {
    const blocks = [block({ date_from: MONDAY, date_to: MONDAY })];
    const slots = freeSlotsForDay(MONDAY, [], blocks, "Dr. Gómez");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
  });

  it("ignora bloques de OTRO doctor", () => {
    const blocks = [
      block({ date_from: MONDAY, date_to: MONDAY, dentist_name: "Dra. Pérez" }),
    ];
    const slots = freeSlotsForDay(MONDAY, [], blocks, "Dr. Gómez");
    expect(slots).toContain("09:00");
  });

  it("sin citas ni bloques, devuelve la grilla completa del día", () => {
    const slots = freeSlotsForDay(MONDAY, [], [], "Dr. Gómez");
    expect(slots).toHaveLength(21);
  });

  it("domingo usa la grilla reducida (09:00-11:00)", () => {
    const slots = freeSlotsForDay(SUNDAY, [], [], "Dr. Gómez");
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
});

describe("formatFreeSlotsMessage", () => {
  it("un día con horarios: encabezado + línea con emoji y negrita", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: MONDAY, label: "Lunes 15", slots: ["09:00", "09:30"] },
    ]);
    expect(text).toBe(
      "Estos son los horarios disponibles para programar su cita:\n\n" +
        "✨ *Lunes 15:* 09:00 | 09:30",
    );
  });

  it("varios días: uno por línea", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: ["09:00"] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: ["10:00", "10:30"] },
    ]);
    expect(text).toContain("✨ *Lunes 15:* 09:00");
    expect(text).toContain("✨ *Martes 16:* 10:00 | 10:30");
  });

  it("omite los días sin horarios libres", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: [] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: ["10:00"] },
    ]);
    expect(text).not.toContain("Lunes 15");
    expect(text).toContain("Martes 16");
  });

  it("si ningún día tiene horarios, devuelve el mensaje de fallback", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: [] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: [] },
    ]);
    expect(text).toBe("No hay horarios disponibles en los próximos 2 días.");
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run tests/freeSlots.test.ts`
Expected: FAIL — `Cannot find module '@/lib/freeSlots'` (el archivo no existe).

- [ ] **Step 3: Implementar `lib/freeSlots.ts`**

```typescript
// Cálculo de horarios libres por doctor (feature "Horarios libres", addon
// "disponibilidad"). Mismo algoritmo que la tool check_availability del
// agente de IA (lib/agent/tools.ts): grilla de buildSlots() menos citas
// reservadas (60 min) menos bloques de no disponibilidad del doctor. Se
// extrae aquí para que un humano (botón en la Agenda) use el mismo cálculo
// sin duplicar la lógica de solapamiento de intervalos.

import { buildSlots } from "@/lib/vapi-helpers";
import { blocksForDay, blockRange, type AvailabilityBlock } from "@/lib/availability";

const APPOINTMENT_DURATION_MS = 60 * 60 * 1000;

export function freeSlotsForDay(
  dateISO: string,
  bookedIntervals: { start: number; end: number }[],
  availabilityBlocks: AvailabilityBlock[],
  dentistName: string,
): string[] {
  const blocks = blocksForDay(dateISO, availabilityBlocks).filter(
    (b) => b.dentist_name.trim() === dentistName.trim(),
  );
  const blockIntervals = blocks.map((b) => {
    const r = blockRange(dateISO, b);
    return { start: r.start.getTime(), end: r.end.getTime() };
  });
  const intervals = [...bookedIntervals, ...blockIntervals];

  return buildSlots(dateISO).filter((s) => {
    const slotStart = new Date(`${dateISO}T${s}:00-04:00`).getTime();
    const slotEnd = slotStart + APPOINTMENT_DURATION_MS;
    return !intervals.some((iv) => iv.start < slotEnd && iv.end > slotStart);
  });
}

export function formatFreeSlotsMessage(
  days: { dateISO: string; label: string; slots: string[] }[],
): string {
  const withSlots = days.filter((d) => d.slots.length > 0);
  if (withSlots.length === 0) {
    return `No hay horarios disponibles en los próximos ${days.length} días.`;
  }
  const lines = withSlots.map((d) => `✨ *${d.label}:* ${d.slots.join(" | ")}`);
  return `Estos son los horarios disponibles para programar su cita:\n\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run tests/freeSlots.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 9 passed (9)`

- [ ] **Step 5: Commit**

```bash
git add lib/freeSlots.ts tests/freeSlots.test.ts
git commit -m "feat(disponibilidad): logica pura de horarios libres por doctor"
```

---

### Task 2: Server action `getFreeSlotsText`

**Files:**
- Modify: `app/(dashboard)/agenda/actions.ts` (agregar al final del archivo)

**Interfaces:**
- Consumes: `freeSlotsForDay`, `formatFreeSlotsMessage` de `lib/freeSlots.ts`
  (Task 1); `mapAvailabilityRow`, `type AvailabilityBlock` de
  `lib/availability.ts`; `boliviaTodayISO`, `boliviaDateISO`, `BOLIVIA_TZ` de
  `lib/format.ts`; `getClinicFeatures` de `lib/superadmin.ts` (mismo import
  que usa `app/(dashboard)/disponibilidad/actions.ts`).
- Produces: `getFreeSlotsText(dentistId: string, days: 3 | 5 | 7): Promise<{ text: string } | { error: string }>` — usado por el modal de Task 3.

- [ ] **Step 1: Agregar imports**

Al inicio de `app/(dashboard)/agenda/actions.ts`, junto a los imports
existentes, agregar:

```typescript
import { getClinicFeatures } from "@/lib/superadmin";
import { boliviaTodayISO, boliviaDateISO, BOLIVIA_TZ } from "@/lib/format";
import { mapAvailabilityRow, type AvailabilityBlock } from "@/lib/availability";
import { freeSlotsForDay, formatFreeSlotsMessage } from "@/lib/freeSlots";
```

- [ ] **Step 2: Agregar la server action al final del archivo**

Agregar al final de `app/(dashboard)/agenda/actions.ts`:

```typescript
const FREE_SLOTS_ROLES = new Set(["admin", "recepcionista"]);

// Próximos N días (fecha ISO + etiqueta "Lunes 13" en español), anclados a
// las 12:00 hora Bolivia para no cruzar de día por redondeo/DST (mismo
// patrón que upcomingDays() en lib/agent/runAgent.ts). El día del mes se
// toma del propio dateISO (no de Date.getDate(), que usaría el huso del
// servidor) para que la etiqueta nunca se corra un día.
function upcomingDaysWithLabel(count: number): { dateISO: string; label: string }[] {
  const todayISO = boliviaTodayISO();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${todayISO}T12:00:00-04:00`);
    d.setDate(d.getDate() + i);
    const dateISO = d.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
    const weekday = d.toLocaleDateString("es-BO", { timeZone: BOLIVIA_TZ, weekday: "long" });
    const dayNum = Number(dateISO.split("-")[2]);
    const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dayNum}`;
    return { dateISO, label };
  });
}

// Texto de horarios libres de un doctor en los próximos N días, listo para
// copiar y pegar en WhatsApp (feature "Horarios libres", addon
// "disponibilidad"). Mismo cálculo que check_availability del agente de IA
// (lib/agent/tools.ts), expuesto para admin/recepción vía un botón en la
// Agenda en vez de tener que copiar horarios a mano de la grilla.
export async function getFreeSlotsText(
  dentistId: string,
  days: 3 | 5 | 7,
): Promise<{ text: string } | { error: string }> {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile || !FREE_SLOTS_ROLES.has(profile.role)) return { error: "Sin permisos." };
  if (!features.disponibilidad)
    return { error: "El módulo de disponibilidad no está habilitado." };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", dentistId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!doc) return { error: "Doctor no encontrado." };
  const dentistName = doc.full_name;

  const daySpec = upcomingDaysWithLabel(days);
  const startISO = daySpec[0].dateISO;
  const endISO = daySpec[daySpec.length - 1].dateISO;

  const [{ data: appts }, { data: availRows }] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("clinic_id", profile.clinicId)
      .eq("dentist_name", dentistName)
      .gte("starts_at", `${startISO}T00:00:00-04:00`)
      .lte("starts_at", `${endISO}T23:59:59-04:00`)
      .not("status", "in", "(cancelled,no_show)"),
    supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles!doctor_availability_dentist_id_fkey(full_name)",
      )
      .eq("clinic_id", profile.clinicId)
      .or(`weekday.not.is.null,and(date_from.lte.${endISO},date_to.gte.${startISO})`),
  ]);

  const bookedByDay = new Map<string, { start: number; end: number }[]>();
  for (const a of appts ?? []) {
    const dayISO = boliviaDateISO(new Date(a.starts_at));
    const start = new Date(a.starts_at).getTime();
    const end = a.ends_at ? new Date(a.ends_at).getTime() : start + 60 * 60 * 1000;
    const list = bookedByDay.get(dayISO) ?? [];
    list.push({ start, end });
    bookedByDay.set(dayISO, list);
  }

  const availability: AvailabilityBlock[] = (availRows ?? []).map(mapAvailabilityRow);

  const dayResults = daySpec.map(({ dateISO, label }) => ({
    dateISO,
    label,
    slots: freeSlotsForDay(dateISO, bookedByDay.get(dateISO) ?? [], availability, dentistName),
  }));

  return { text: formatFreeSlotsMessage(dayResults) };
}
```

- [ ] **Step 3: Verificar tipos y que el resto del archivo sigue intacto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (los únicos preexistentes, si aparecen, son de
`.next/types` faltantes por falta de build — no relacionados con este
archivo; si aparece cualquier error señalando `actions.ts`, es un error real
a corregir).

Run: `npx vitest run tests/freeSlots.test.ts`
Expected: sigue en verde (9/9) — esta tarea no debía tocar `lib/freeSlots.ts`.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/agenda/actions.ts"
git commit -m "feat(disponibilidad): server action getFreeSlotsText"
```

---

### Task 3: Modal "Horarios libres" + botón en la Agenda

**Files:**
- Create: `components/agenda/FreeSlotsModal.tsx`
- Modify: `components/agenda/AgendaShell.tsx`
- Modify: `app/(dashboard)/agenda/page.tsx`

**Interfaces:**
- Consumes: `getFreeSlotsText` de `app/(dashboard)/agenda/actions.ts` (Task 2);
  `type DoctorOption` de `./apptHelpers` (ya existe: `{ id: string; full_name: string }`);
  `Modal` de `@/components/ui/Modal`, `Button` de `@/components/ui/Button`,
  `fieldInputClass`/`FieldLabel` de `@/components/ui/Field` (ya existen).
- Produces: componente `FreeSlotsModal({ doctors, onClose }): JSX.Element`;
  prop nueva `disponibilidadEnabled: boolean` en `AgendaShell`.

- [ ] **Step 1: Crear `components/agenda/FreeSlotsModal.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { getFreeSlotsText } from "@/app/(dashboard)/agenda/actions";
import { type DoctorOption } from "./apptHelpers";

const DAY_OPTIONS = [3, 5, 7] as const;

export function FreeSlotsModal({
  doctors,
  onClose,
}: {
  doctors: DoctorOption[];
  onClose: () => void;
}) {
  const [dentistId, setDentistId] = useState(doctors[0]?.id ?? "");
  const [days, setDays] = useState<3 | 5 | 7>(5);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!dentistId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCopied(false);
    getFreeSlotsText(dentistId, days).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in res) {
        setError(res.error);
        setText("");
      } else {
        setText(res.text);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dentistId, days]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciónalo y cópialo manualmente.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Horarios libres"
      subtitle="Genera un texto listo para copiar y pegar en WhatsApp."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-[180px] flex-1 text-sm">
            <FieldLabel>Doctor</FieldLabel>
            <select
              className={fieldInputClass}
              value={dentistId}
              onChange={(e) => setDentistId(e.target.value)}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-28 text-sm">
            <FieldLabel>Próximos</FieldLabel>
            <select
              className={fieldInputClass}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as 3 | 5 | 7)}
            >
              {DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} días
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        <textarea
          readOnly
          value={loading ? "Calculando..." : text}
          rows={10}
          onFocus={(e) => e.target.select()}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        />

        <Button type="button" onClick={copy} disabled={loading || !text}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire en `AgendaShell.tsx`**

Agregar la prop `disponibilidadEnabled` a la firma del componente (junto a
`avisoDoctoresEnabled`, alrededor de la línea 74 del archivo actual):

```typescript
  avisoDoctoresEnabled,
  disponibilidadEnabled = false,
  availability = [],
```

y en el bloque de tipos:

```typescript
  avisoDoctoresEnabled: boolean;
  /** Addon "Disponibilidad Doctores": habilita el botón "Horarios libres". */
  disponibilidadEnabled?: boolean;
```

Agregar el import junto a los demás imports de componentes de vista:

```typescript
import { FreeSlotsModal } from "./FreeSlotsModal";
```

Agregar el estado del modal junto a `showDoctorAviso` (línea ~103):

```typescript
  const [showFreeSlots, setShowFreeSlots] = useState(false);
```

Agregar el botón en la barra de herramientas, junto al bloque del botón
"Avisar a doctores" (después de su bloque `{canWrite && avisoDoctoresEnabled && (...)}`,
alrededor de la línea 497):

```typescript
        {isAdmin && disponibilidadEnabled && (
          <button
            onClick={() => setShowFreeSlots(true)}
            title="Generar texto de horarios libres para copiar y pegar"
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Horarios libres</span>
          </button>
        )}
```

Agregar `CalendarClock` al import de `lucide-react` que ya existe al tope
del archivo (junto a `ChevronLeft, ChevronRight, Send, ...`).

Agregar el render del modal junto a los otros modales condicionales (después
del bloque `{showDoctorAviso && (...)}`, alrededor de la línea 614):

```typescript
      {showFreeSlots && (
        <FreeSlotsModal doctors={doctors} onClose={() => setShowFreeSlots(false)} />
      )}
```

- [ ] **Step 3: Pasar la prop desde `app/(dashboard)/agenda/page.tsx`**

En el JSX de `<AgendaShell ... />` (donde ya se pasan
`recordatoriosEnabled`, `whatsappManualEnabled`, `avisoDoctoresEnabled`),
agregar:

```typescript
        disponibilidadEnabled={features.disponibilidad}
```

- [ ] **Step 4: Verificar tipos y tests**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en los archivos tocados.

Run: `npm test`
Expected: `Test Files 37 passed (37)`, todos los tests existentes en verde
(incluidos los 9 nuevos de `tests/freeSlots.test.ts` de la Task 1).

- [ ] **Step 5: Verificación manual (si el entorno de desarrollo lo permite)**

Con el addon `disponibilidad` encendido y logueado como admin/recepción:
abrir Agenda, clic en "Horarios libres", elegir un doctor con citas y con
algún bloque de "Disponibilidad Doctores" registrado, confirmar que el texto
generado excluye esos horarios y que "Copiar" deja el texto en el
portapapeles. Con el addon apagado, el botón no debe aparecer.

- [ ] **Step 6: Commit**

```bash
git add components/agenda/FreeSlotsModal.tsx components/agenda/AgendaShell.tsx "app/(dashboard)/agenda/page.tsx"
git commit -m "feat(disponibilidad): boton y modal Horarios libres en la Agenda"
```
