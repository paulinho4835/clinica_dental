# Odontograma Pediátrico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new opt-in addon "Odontograma Pediátrico" that lets clinics record a temporary-dentition odontogram (FDI 51-85) per patient, separate from and alongside the existing adult odontogram.

**Architecture:** Reuse the existing generic SVG tooth renderer (`Tooth.tsx`) and its FDI-agnostic helpers (`isAnterior`, `toothType`) unchanged. Parametrize the two components that currently hardcode the adult quadrant layout (`Odontogram.tsx`, `OdontogramEditor.tsx`) with optional `quadrants` / `quadrantNumbers` / `saveAction` props so the exact same components render either dentition — no duplicate editor component. Data lives in two new tables (`odontograms_pediatric`, `odontogram_pediatric_events`) mirroring the adult schema exactly, gated by a new opt-in feature flag `odontograma_pediatrico`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + RLS), TypeScript, Vitest.

## Global Constraints

- Español neutro en toda la UI (sin voseo): "haz", "puedes", nunca "hacé"/"podés".
- NUNCA hacer push sin autorización explícita del usuario — este plan termina en commits locales, no en push.
- Solo dentición temporal (FDI 51-85, 20 dientes); sin dentición mixta en esta versión.
- Misma paleta de condiciones que el odontograma de adultos (ningún cambio a `Tool`/`CONDITION_*`/`SURFACE_CONDITIONS`/`WHOLE_CONDITIONS`).
- Próxima migración disponible: `0086_odontograma_pediatrico.sql`.
- Roles que pueden editar (igual que el odontograma de adultos): `admin`, `odontologo_general`, `especialista`, `colega` (NO `recepcionista`).

---

### Task 1: Migración de base de datos — tablas del odontograma pediátrico

**Files:**
- Create: `supabase/migrations/0086_odontograma_pediatrico.sql`

**Interfaces:**
- Produces: tablas `odontograms_pediatric(id, clinic_id, patient_id unique, teeth jsonb, updated_at)` y `odontogram_pediatric_events(id, clinic_id, patient_id, tooth_fdi, surface, prev_state, new_state, actor_id, created_at)`, ambas con RLS `tenant_isolation` usando `auth_clinic_id()` (helper ya definido en `0002_rls.sql`), igual que `odontograms`/`odontogram_events` (`0001_schema.sql`) y `perio_exams` (`0073_perio_exams.sql`).

- [ ] **Step 1: Escribir la migración**

```sql
-- 0086_odontograma_pediatrico.sql — Addon opt-in "odontograma_pediatrico"
-- Odontograma de dentición temporal (FDI 51-85, 20 dientes), independiente
-- del odontograma de adultos (odontograms/odontogram_events). Mismo shape
-- exacto: 1 fila de estado actual por paciente + log inmutable de eventos
-- para auditoría/historial, igual patrón que odontograms.

create table if not exists odontograms_pediatric (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade unique,
  teeth       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists odontogram_pediatric_events (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  tooth_fdi   text not null,           -- '51'..'85' (dentición temporal)
  surface     text,                    -- 'O','M','D','V','L' o null (diente completo)
  prev_state  text,
  new_state   text,
  actor_id    uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_odo_ped_events_patient
  on odontogram_pediatric_events(clinic_id, patient_id, created_at);

create trigger trg_odontograms_pediatric_updated
  before update on odontograms_pediatric
  for each row execute function set_updated_at();

alter table odontograms_pediatric enable row level security;
create policy tenant_isolation on odontograms_pediatric
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

alter table odontogram_pediatric_events enable row level security;
create policy tenant_isolation on odontogram_pediatric_events
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
```

- [ ] **Step 2: Aplicar la migración en local (Supabase local, Docker)**

Run: `npx supabase db reset` (o `npx supabase migration up` si prefieres no resetear datos locales)
Expected: la migración `0086_odontograma_pediatrico.sql` corre sin errores y las tablas quedan creadas. Verificar con:

Run: `npx supabase db execute --local "select tablename from pg_tables where tablename like 'odontogram%pediatric%'"`
Expected: devuelve `odontograms_pediatric` y `odontogram_pediatric_events`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0086_odontograma_pediatrico.sql
git commit -m "feat(odontograma-pediatrico): migracion de tablas odontograms_pediatric y eventos"
```

---

### Task 2: Feature flag del addon

**Files:**
- Modify: `lib/features.ts`
- Test: `tests/features.test.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `normalizeFeatures`, `FEATURES`, `FeatureKey` ya existentes).
- Produces: `FeatureKey` incluye `"odontograma_pediatrico"`; `normalizeFeatures(raw).odontograma_pediatrico` es `false` a menos que `raw.odontograma_pediatrico === true` (opt-in).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/features.test.ts`:

```ts
describe("odontograma_pediatrico (addon opt-in)", () => {
  it("apagado por defecto", () => {
    expect(normalizeFeatures({}).odontograma_pediatrico).toBe(false);
  });

  it("se enciende con true explícito", () => {
    expect(normalizeFeatures({ odontograma_pediatrico: true }).odontograma_pediatrico).toBe(true);
  });

  it("está en el catálogo FEATURES como opt-in", () => {
    const entry = FEATURES.find((f) => f.key === "odontograma_pediatrico");
    expect(entry?.optIn).toBe(true);
    expect(entry?.href).toBe("/pacientes");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/features.test.ts`
Expected: FAIL — `Property 'odontograma_pediatrico' does not exist` (error de tipos) o el test de catálogo falla porque `entry` es `undefined`.

- [ ] **Step 3: Agregar la key al union y al catálogo**

En `lib/features.ts`, agregar `"odontograma_pediatrico"` al final del union `FeatureKey` (línea 35, justo después de `"periodontograma"`):

```ts
  | "logo"
  | "periodontograma"
  | "odontograma_pediatrico";
```

Y agregar la entrada al array `FEATURES` (después de la entrada de `periodontograma`, línea 103-104):

```ts
  // Addon opt-in: odontograma de dentición temporal (FDI 51-85), independiente
  // del odontograma de adultos. Vive en la ficha del paciente.
  { key: "odontograma_pediatrico", label: "Odontograma Pediátrico", href: "/pacientes", optIn: true },
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/features.test.ts`
Expected: PASS (todos los tests del archivo, incluido el nuevo `describe`).

- [ ] **Step 5: Commit**

```bash
git add lib/features.ts tests/features.test.ts
git commit -m "feat(odontograma-pediatrico): agregar feature flag opt-in"
```

---

### Task 3: Constantes de cuadrantes de dentición temporal

**Files:**
- Create: `lib/odontogram/pediatricTypes.ts`
- Test: `tests/odontogram-pediatric-types.test.ts`

**Interfaces:**
- Consumes: `isAnterior`, `toothType` de `lib/odontogram/types.ts` (sin modificar).
- Produces: `PEDIATRIC_QUADRANTS: string[][]` (4 arrays de 5 FDI cada uno, mismo orden que `QUADRANTS` de adultos: sup. derecho, sup. izquierdo, inf. derecho, inf. izquierdo) y `PEDIATRIC_QUADRANT_NUMBERS: [number, number, number, number]` (`[5, 6, 8, 7]`, mismo orden de despliegue que usa `Odontogram.tsx`: top-left, top-right, bottom-left, bottom-right).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/odontogram-pediatric-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAnterior, toothType } from "@/lib/odontogram/types";
import { PEDIATRIC_QUADRANTS, PEDIATRIC_QUADRANT_NUMBERS } from "@/lib/odontogram/pediatricTypes";

describe("PEDIATRIC_QUADRANTS", () => {
  it("tiene 4 cuadrantes de 5 dientes cada uno (20 dientes temporales)", () => {
    expect(PEDIATRIC_QUADRANTS).toHaveLength(4);
    for (const q of PEDIATRIC_QUADRANTS) expect(q).toHaveLength(5);
  });

  it("usa FDI de dentición temporal (51-85)", () => {
    const all = PEDIATRIC_QUADRANTS.flat();
    expect(all).toEqual([
      "55", "54", "53", "52", "51",
      "61", "62", "63", "64", "65",
      "85", "84", "83", "82", "81",
      "71", "72", "73", "74", "75",
    ]);
  });

  it("PEDIATRIC_QUADRANT_NUMBERS son los cuadrantes FDI 5,6,8,7 en orden de despliegue", () => {
    expect(PEDIATRIC_QUADRANT_NUMBERS).toEqual([5, 6, 8, 7]);
  });

  it("isAnterior/toothType funcionan igual con FDI temporal (2do dígito define forma)", () => {
    expect(isAnterior("51")).toBe(true); // incisivo central temporal
    expect(isAnterior("53")).toBe(true); // canino temporal
    expect(isAnterior("55")).toBe(false); // 2do molar temporal
    expect(toothType("51")).toBe("incisor");
    expect(toothType("53")).toBe("canine");
    expect(toothType("55")).toBe("molar");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/odontogram-pediatric-types.test.ts`
Expected: FAIL — `Cannot find module '@/lib/odontogram/pediatricTypes'`.

- [ ] **Step 3: Crear `lib/odontogram/pediatricTypes.ts`**

```ts
// Cuadrantes de la dentición TEMPORAL (dientes de leche), FDI 51-85.
// Mismo orden de despliegue que QUADRANTS (adultos) en lib/odontogram/types.ts:
// [sup. derecho, sup. izquierdo, inf. derecho, inf. izquierdo]. Cada cuadrante
// temporal tiene 5 dientes (2do molar, 1er molar, canino, lateral, central)
// en vez de los 8 de la dentición permanente.
export const PEDIATRIC_QUADRANTS: string[][] = [
  ["55", "54", "53", "52", "51"], // sup. derecho
  ["61", "62", "63", "64", "65"], // sup. izquierdo
  ["85", "84", "83", "82", "81"], // inf. derecho
  ["71", "72", "73", "74", "75"], // inf. izquierdo
];

// Números de cuadrante FDI a mostrar en las etiquetas, mismo orden de
// despliegue que usa Odontogram.tsx (top-left, top-right, bottom-left,
// bottom-right): temporal superior derecho=5, superior izquierdo=6,
// inferior izquierdo=7, inferior derecho=8.
export const PEDIATRIC_QUADRANT_NUMBERS: [number, number, number, number] = [5, 6, 8, 7];
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/odontogram-pediatric-types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/odontogram/pediatricTypes.ts tests/odontogram-pediatric-types.test.ts
git commit -m "feat(odontograma-pediatrico): constantes de cuadrantes de denticion temporal"
```

---

### Task 4: Parametrizar `Odontogram.tsx` para aceptar cuadrantes distintos

**Files:**
- Modify: `components/odontogram/Odontogram.tsx`

**Interfaces:**
- Consumes: `PEDIATRIC_QUADRANTS`, `PEDIATRIC_QUADRANT_NUMBERS` de Task 3 (usados por el caller en Task 6, no por este archivo directamente).
- Produces: `Odontogram` acepta ahora `quadrants?: string[][]` (default `QUADRANTS`) y `quadrantNumbers?: [number, number, number, number]` (default `[1, 2, 4, 3]`), sin cambiar el comportamiento por defecto para ningún caller existente.

No requiere test nuevo: es un cambio de renderizado puro (JSX), ya cubierto manualmente en Task 7. Se verifica con `tsc` (Task 4 Step 2) y visualmente en Task 7.

- [ ] **Step 1: Modificar la interfaz y el cuerpo del componente**

En `components/odontogram/Odontogram.tsx`, reemplazar el bloque `interface Props` (líneas 16-20) y la firma de la función (línea 23) y el uso de `QUADRANTS`/`qLabel` (líneas 24-84):

```tsx
interface Props {
  teeth: TeethMap;
  onSurfaceClick?: (fdi: string, surface: Surface) => void;
  onWholeClick?: (fdi: string) => void;
  /** Cuadrantes a dibujar; por defecto la dentición permanente (adultos). */
  quadrants?: string[][];
  /** Números FDI de cuadrante a mostrar, en orden [top-l, top-r, bottom-l, bottom-r]. */
  quadrantNumbers?: [number, number, number, number];
}

// Odontograma completo dibujado 100% en SVG desde el JSONB. Ninguna imagen.
export function Odontogram({
  teeth,
  onSurfaceClick,
  onWholeClick,
  quadrants = QUADRANTS,
  quadrantNumbers = [1, 2, 4, 3],
}: Props) {
  const row = (fdis: string[]) => (
    <div className="flex gap-1">
      {fdis.map((fdi) => (
        <Tooth
          key={fdi}
          fdi={fdi}
          state={teeth[fdi]}
          onSurfaceClick={onSurfaceClick}
          onWholeClick={onWholeClick}
        />
      ))}
    </div>
  );

  const midline = (
    <div
      className="mx-2 self-stretch border-l-2 border-dashed border-slate-300"
      aria-hidden
    />
  );

  const qLabel = (n: number, side: "l" | "r") => (
    <span
      className={`text-[10px] font-semibold text-slate-400 ${side === "l" ? "text-left" : "text-right"}`}
    >
      Cuadrante {n}
    </span>
  );

  const [topLeft, topRight, bottomLeft, bottomRight] = quadrantNumbers;

  return (
    <div className="space-y-4">
      <div className="inline-block overflow-x-auto rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="min-w-max">
          {/* Etiquetas de cuadrantes superiores */}
          <div className="mb-1 flex justify-between px-1">
            {qLabel(topLeft, "l")}
            {qLabel(topRight, "r")}
          </div>

          {/* Arcada superior */}
          <div className="flex items-start">
            {row(quadrants[0])}
            {midline}
            {row(quadrants[1])}
          </div>

          {/* Línea de oclusión (separa maxilar de mandíbula) */}
          <div className="my-3 border-t-2 border-dashed border-slate-300" />

          {/* Arcada inferior */}
          <div className="flex items-start">
            {row(quadrants[2])}
            {midline}
            {row(quadrants[3])}
          </div>

          {/* Etiquetas de cuadrantes inferiores */}
          <div className="mt-1 flex justify-between px-1">
            {qLabel(bottomLeft, "l")}
            {qLabel(bottomRight, "r")}
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}
```

(El resto del archivo — `Swatch`, `Legend` — queda sin cambios.)

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `components/odontogram/Odontogram.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/odontogram/Odontogram.tsx
git commit -m "refactor(odontograma): parametrizar cuadrantes para reutilizar en dentición pediátrica"
```

---

### Task 5: Parametrizar `OdontogramEditor.tsx` para aceptar cuadrantes y acción de guardado distintos

**Files:**
- Modify: `components/odontogram/OdontogramEditor.tsx`

**Interfaces:**
- Consumes: `Odontogram` con las nuevas props de Task 4.
- Produces: `OdontogramEditor` acepta ahora `quadrants?: string[][]`, `quadrantNumbers?: [number, number, number, number]` y `saveAction?: SaveAction` (tipo `(patientId: string, prevTeeth: TeethMap, nextTeeth: TeethMap) => Promise<{ error?: string; ok?: boolean }>`), todos opcionales y con default = comportamiento actual (`QUADRANTS` vía default de `Odontogram`, `saveOdontogram`). El caller de Task 7 (`pacientes/[id]/page.tsx`) usará estas props para el odontograma pediátrico.

No requiere test nuevo: es un componente cliente con `useState`/efectos ya cubierto por la app; se verifica con `tsc` y la prueba manual de Task 7.

- [ ] **Step 1: Modificar la firma y el uso interno**

En `components/odontogram/OdontogramEditor.tsx`, después del tipo `Tool` (línea 29), agregar:

```ts
// Firma compartida con saveOdontogram/savePediatricOdontogram: ambas devuelven
// el mismo shape de ActionState sin acoplar este componente a un archivo de
// acciones específico.
type SaveAction = (
  patientId: string,
  prevTeeth: TeethMap,
  nextTeeth: TeethMap,
) => Promise<{ error?: string; ok?: boolean }>;
```

Reemplazar la firma de la función (líneas 31-40):

```tsx
export function OdontogramEditor({
  patientId,
  initialTeeth,
  canWrite,
  quadrants,
  quadrantNumbers,
  saveAction = saveOdontogram,
}: {
  patientId: string;
  initialTeeth: TeethMap;
  /** Solo admin y doctores pueden editar; el resto ve el odontograma en solo lectura. */
  canWrite: boolean;
  /** Cuadrantes a dibujar; por defecto la dentición permanente (adultos). */
  quadrants?: string[][];
  /** Números FDI de cuadrante a mostrar; ver Odontogram.tsx. */
  quadrantNumbers?: [number, number, number, number];
  /** Server action de guardado; por defecto saveOdontogram (adultos). */
  saveAction?: SaveAction;
}) {
```

Reemplazar la función `save()` (líneas 83-95) para usar `saveAction` en vez de `saveOdontogram` directamente:

```tsx
  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveAction(patientId, baseline, teeth);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBaseline(teeth); // nuevo baseline para el próximo diff
    setDirty(false);
    router.refresh();
  }
```

Y las dos llamadas a `<Odontogram .../>` (líneas 129 y 210) para reenviar `quadrants`/`quadrantNumbers`:

```tsx
        <Odontogram
          teeth={teeth}
          onSurfaceClick={() => {}}
          onWholeClick={() => {}}
          quadrants={quadrants}
          quadrantNumbers={quadrantNumbers}
        />
```

```tsx
      <Odontogram
        teeth={teeth}
        onSurfaceClick={onSurfaceClick}
        onWholeClick={onWholeClick}
        quadrants={quadrants}
        quadrantNumbers={quadrantNumbers}
      />
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `components/odontogram/OdontogramEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/odontogram/OdontogramEditor.tsx
git commit -m "refactor(odontograma): parametrizar OdontogramEditor con saveAction y cuadrantes"
```

---

### Task 6: Server actions del odontograma pediátrico

**Files:**
- Create: `app/(dashboard)/pacientes/pediatric-odontogram-actions.ts`

**Interfaces:**
- Consumes: `TeethMap` de `lib/odontogram/types.ts`; `getProfile()` de `lib/auth`; `withinClinicalHours` de `lib/clinicalHours`; `getClinicFeatures()` de `lib/superadmin`.
- Produces: `export async function savePediatricOdontogram(patientId: string, prevTeeth: TeethMap, nextTeeth: TeethMap): Promise<ActionState>` con `ActionState = { error?: string; ok?: boolean }` — misma firma que `saveOdontogram`, consumida por `OdontogramEditor`'s `saveAction` prop (Task 5) y por `pacientes/[id]/page.tsx` (Task 7).

No requiere test unitario nuevo: es una server action con efectos en Supabase (igual que `odontogram-actions.ts`, que tampoco tiene test unitario propio — se prueba manualmente end-to-end en Task 7).

- [ ] **Step 1: Crear el archivo, copiando el patrón exacto de `odontogram-actions.ts` apuntando a las tablas pediátricas**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { getClinicFeatures } from "@/lib/superadmin";
import type { TeethMap } from "@/lib/odontogram/types";

export type ActionState = { error?: string; ok?: boolean };

// Mismos roles que el odontograma de adultos (NO recepcionista).
const ODONTOGRAM_ROLES = ["admin", "odontologo_general", "especialista", "colega"] as const;
function canEditOdontogram(role: string | undefined): boolean {
  return ODONTOGRAM_ROLES.includes(role as (typeof ODONTOGRAM_ROLES)[number]);
}

const SURFACES = ["O", "M", "D", "V", "L"] as const;

type EventRow = {
  clinic_id: string;
  patient_id: string;
  tooth_fdi: string;
  surface: string | null;
  prev_state: string | null;
  new_state: string | null;
  actor_id: string;
};

// Compara estado previo vs nuevo y produce un evento por cada cambio
// (cara o diente completo) -> log inmutable de auditoría.
function diffTeeth(
  prev: TeethMap,
  next: TeethMap,
  base: Omit<EventRow, "tooth_fdi" | "surface" | "prev_state" | "new_state">,
): EventRow[] {
  const events: EventRow[] = [];
  const fdis = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const fdi of fdis) {
    const a = prev[fdi];
    const b = next[fdi];

    const aWhole = a?.whole ?? null;
    const bWhole = b?.whole ?? null;
    if (aWhole !== bWhole) {
      events.push({ ...base, tooth_fdi: fdi, surface: null, prev_state: aWhole, new_state: bWhole });
    }

    for (const s of SURFACES) {
      const aS = a?.surfaces?.[s] ?? null;
      const bS = b?.surfaces?.[s] ?? null;
      if (aS !== bS) {
        events.push({ ...base, tooth_fdi: fdi, surface: s, prev_state: aS, new_state: bS });
      }
    }
  }
  return events;
}

export async function savePediatricOdontogram(
  patientId: string,
  prevTeeth: TeethMap,
  nextTeeth: TeethMap,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canEditOdontogram(profile.role))
    return { error: "Solo los doctores y el administrador pueden modificar el odontograma." };

  const supabase = await createClient();

  // Bloqueo horario (addon "bloqueo_horario"): mismo comportamiento que el
  // odontograma de adultos.
  if (profile.role !== "admin") {
    const features = await getClinicFeatures();
    if (features.bloqueo_horario) {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("settings")
        .eq("id", profile.clinicId)
        .single();
      if (!withinClinicalHours(clinic?.settings))
        return { error: "Fuera del horario de edición permitido. El odontograma está en modo lectura." };
    }
  }

  // 1) Estado actual (1 fila por paciente).
  const { error: upErr } = await supabase.from("odontograms_pediatric").upsert(
    {
      clinic_id: profile.clinicId,
      patient_id: patientId,
      teeth: nextTeeth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "patient_id" },
  );
  if (upErr) return { error: upErr.message };

  // 2) Log inmutable de los cambios.
  const events = diffTeeth(prevTeeth, nextTeeth, {
    clinic_id: profile.clinicId,
    patient_id: patientId,
    actor_id: profile.userId,
  });
  if (events.length > 0) {
    const { error: evErr } = await supabase.from("odontogram_pediatric_events").insert(events);
    if (evErr) return { error: evErr.message };
  }

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores en `app/(dashboard)/pacientes/pediatric-odontogram-actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/pacientes/pediatric-odontogram-actions.ts"
git commit -m "feat(odontograma-pediatrico): server action de guardado con auditoria"
```

---

### Task 7: Cablear la pestaña en la ficha del paciente

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `PEDIATRIC_QUADRANTS`, `PEDIATRIC_QUADRANT_NUMBERS` (Task 3), `savePediatricOdontogram` (Task 6), `OdontogramEditor` con props nuevas (Task 5), `OdontogramHistory` (sin cambios, ya genérico).
- Produces: sección "Odontograma Pediátrico" visible solo si `features.odontograma_pediatrico`, con su propio historial de auditoría independiente del odontograma de adultos.

- [ ] **Step 1: Agregar imports**

En `app/(dashboard)/pacientes/[id]/page.tsx`, junto a los imports existentes de odontograma (líneas 6-7, 20):

```ts
import { PEDIATRIC_QUADRANTS, PEDIATRIC_QUADRANT_NUMBERS } from "@/lib/odontogram/pediatricTypes";
import { savePediatricOdontogram } from "@/app/(dashboard)/pacientes/pediatric-odontogram-actions";
```

- [ ] **Step 2: Cargar datos del odontograma pediátrico (gateado por el addon)**

Justo después del bloque de `perioExams` (después de la línea 299, antes de `const consentRows`), agregar:

```ts
  // Odontograma pediátrico (addon "odontograma_pediatrico"): dentición
  // temporal, independiente del odontograma de adultos. Mismo patrón que
  // perioExams: solo se consulta si el addon está encendido.
  const odontogramaPediatricoEnabled = features.odontograma_pediatrico;
  let teethPediatric: TeethMap = {};
  let odoPedEvents: {
    id: string;
    tooth_fdi: string;
    surface: string | null;
    prev_state: string | null;
    new_state: string | null;
    created_at: string;
    actor_name: string | null;
  }[] = [];
  if (odontogramaPediatricoEnabled) {
    const { data: odoPed } = await supabase
      .from("odontograms_pediatric")
      .select("teeth")
      .eq("patient_id", id)
      .maybeSingle();
    teethPediatric = (odoPed?.teeth as TeethMap) ?? {};

    const { data: rawOdoPedEvents } = await supabase
      .from("odontogram_pediatric_events")
      .select("id, tooth_fdi, surface, prev_state, new_state, created_at, actor:profiles(id, full_name)")
      .eq("patient_id", id)
      .order("created_at", { ascending: false });
    odoPedEvents = (rawOdoPedEvents ?? []).map((e) => {
      const actor = e.actor as { id?: string; full_name?: string } | null;
      const actorName =
        !actor || platformAdminIdSet.has(actor.id ?? "")
          ? null
          : actor.full_name ?? null;
      return {
        id: e.id as string,
        tooth_fdi: e.tooth_fdi as string,
        surface: (e.surface as string | null) ?? null,
        prev_state: (e.prev_state as string | null) ?? null,
        new_state: (e.new_state as string | null) ?? null,
        created_at: e.created_at as string,
        actor_name: actorName,
      };
    });
  }
```

- [ ] **Step 3: Renderizar la sección, junto a la de Periodontograma**

Después de la sección `Periodontograma` (después de la línea 447 `)}`), agregar:

```tsx
      {odontogramaPediatricoEnabled && (
        <section className="space-y-3">
          <h2 className="mb-3 text-lg font-semibold">Odontograma Pediátrico</h2>
          <OdontogramEditor
            patientId={patient.id}
            initialTeeth={teethPediatric}
            canWrite={canEditClinical}
            quadrants={PEDIATRIC_QUADRANTS}
            quadrantNumbers={PEDIATRIC_QUADRANT_NUMBERS}
            saveAction={savePediatricOdontogram}
          />
          <OdontogramHistory events={odoPedEvents} canSeeHistory={canSeeHistory} />
        </section>
      )}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `app/(dashboard)/pacientes/[id]/page.tsx`.

- [ ] **Step 5: Correr toda la suite de tests**

Run: `npx vitest run`
Expected: PASS — todos los tests, incluidos los nuevos de Task 2 y Task 3.

- [ ] **Step 6: Prueba manual end-to-end**

1. Activar el addon "Odontograma Pediátrico" para una clínica desde `/superadmin`.
2. Abrir un paciente de esa clínica en `/pacientes/[id]`.
3. Confirmar que aparece la sección "Odontograma Pediátrico" con 20 dientes (5 por cuadrante), cuadrantes rotulados 5/6/7/8, formas correctas (incisivos/caninos redondeados, molares cuadrados).
4. Marcar una condición (ej. caries) en un diente temporal y guardar.
5. Recargar la página: confirmar que la marca persiste.
6. Como `admin`, abrir "Historial de cambios" y confirmar que aparece el evento.
7. Confirmar que el odontograma de ADULTOS del mismo paciente no cambió (son independientes).
8. Desactivar el addon en Superadmin y confirmar que la sección desaparece de la ficha.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "feat(odontograma-pediatrico): agregar seccion en la ficha del paciente"
```

---

## Fuera de alcance (recordatorio del spec)

- Dentición mixta / seguimiento de recambio dental.
- Auto-selección de pestaña por edad del paciente.
- Paleta de condiciones adaptada/reducida.
- Migración de datos entre odontograma de adultos y pediátrico.

## Pendiente post-implementación

- Aplicar la migración `0086` en producción (Supabase SQL Editor, siguiendo el patrón ya establecido en el proyecto — CLI no disponible para esa cuenta).
