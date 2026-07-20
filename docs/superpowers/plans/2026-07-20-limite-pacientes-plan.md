# Límite de pacientes por clínica (upsell) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al superadmin una palanca de upsell: un tope de pacientes por clínica, editable a mano, que muestra un aviso (nunca un bloqueo) a la clínica cuando se acerca o supera el tope.

**Architecture:** Nueva columna `clinics.max_patients` (nullable = ilimitado). El superadmin la edita inline desde `/superadmin` con un componente clon de `PhotoQuotaInput`. La clínica ve un banner informativo en `/pacientes` cuando su conteo real de pacientes cruza el 80%/90% del tope, reutilizando `usageLevel()` (ya testeada) — nunca bloquea la creación de pacientes.

**Tech Stack:** Next.js App Router (server actions + server components), Supabase (Postgres), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-20-limite-pacientes-plan-design.md`

## Global Constraints

- Español neutro en toda la UI (sin voseo: "haz" no "hacé").
- **NUNCA hacer push sin autorización explícita del usuario** (commits locales sí).
- `max_patients` es `integer` nullable en `clinics`. `null` = sin tope (comportamiento actual, sin cambios para ninguna clínica existente).
- Nunca bloquear la creación de pacientes por este límite, bajo ninguna circunstancia — es puramente informativo.
- El banner solo se muestra si `max_patients` no es `null` **y** `usageLevel(count, max_patients)` es `"warn"` o `"danger"` (umbrales 80%/90% ya definidos en `lib/storageLimits.ts` — no crear umbrales nuevos).
- **Ajuste respecto al spec:** el spec menciona mostrar el banner también a `colega` en modo "consultorio compartido". Ese modo (`profile.sharedPractice`, `canSeeNav(..., opts)`) vive únicamente en la rama/worktree `feature/consultorio-compartido-colegas`, todavía sin mergear a `main` — en este branch, `getProfile()` no tiene campo `sharedPractice` y `can()`/`canSeeNav()` no aceptan opts. Este plan implementa el banner solo para `profile?.role === "admin"`. Cuando esa rama se mergee, extender la condición es un cambio de una línea (fuera de alcance aquí).
- La numeración de migraciones en `main` llega hasta `0090` — la nueva es `0091` (ver nota de la misma razón en el archivo de migración).
- Los tests corren con `npm test` (vitest); typecheck con `npx tsc --noEmit`. No existe test unitario para ninguna server action de `superadmin/actions.ts` hoy (`setMaxUsers`, `setPhotoQuota` no están testeadas) — este plan sigue esa misma convención para `setMaxPatients` y verifica con typecheck + prueba manual, no agrega infraestructura de test nueva.

## Datos del código existente que necesitas saber

- `app/(dashboard)/superadmin/actions.ts` — `assertSuperadmin()` (línea 12-14) gatea todas las actions. `setMaxUsers` (línea 236-246) y `setPhotoQuota` (línea 251-271) son el patrón exacto a clonar para `setMaxPatients`.
- `components/superadmin/MaxUsersInput.tsx` y `components/superadmin/PhotoQuotaInput.tsx` — patrón de edición inline con `useActionState`. `PhotoQuotaInput` es el más cercano (badge "usado/tope") pero asume tope siempre numérico; `MaxPatientsInput` debe además soportar tope `null` (sin tope).
- `app/(dashboard)/superadmin/page.tsx` — arma `ClinicRow[]` a partir de queries en paralelo (líneas 53-72) y mapea a `rows` (líneas 159-171). `photoCounts` (líneas 110-118) es el patrón exacto para agregar un conteo por clínica en JS a partir de una sola query.
- `components/superadmin/ClinicList.tsx` — tipo `ClinicRow` (líneas 26-38); `MaxUsersInput` se renderiza en la fila de encabezado de cada tarjeta (líneas 170-181), junto al ícono `Users` de `lucide-react` (ya importado en línea 5).
- `app/(dashboard)/pacientes/page.tsx` — server component; `profile` viene de `getProfile()` (línea 39). El query de pacientes (líneas 46-53) se filtra por búsqueda `q` — **no sirve para el conteo total**, hace falta un `count` aparte sin el filtro.
- `lib/storageLimits.ts` — `usageLevel(used, limit): "ok" | "warn" | "danger"` (ya testeada, umbrales 80%/90%) y el patrón de banner ámbar/rojo ya usado en `app/(dashboard)/superadmin/page.tsx:214-250` (clases exactas a reutilizar).
- `lib/auth.ts` — `getProfile()` devuelve `{ userId, clinicId, role, fullName }` (sin `sharedPractice` en este branch).
- Patrón de conteo ya usado en el repo: `.select("id", { count: "exact", head: true })` (ej. `app/(dashboard)/inicio/page.tsx:88`).

---

### Task 1: Migración SQL 0091 — columna `max_patients`

**Files:**
- Create: `supabase/migrations/0091_max_patients.sql`

**Interfaces:**
- Produces: columna `clinics.max_patients integer` (nullable). Las tareas 2-4 dependen de esta columna.

- [ ] **Step 1: Escribir la migración**

```sql
-- Tope de pacientes por clínica (palanca de upsell manual del superadmin,
-- mismo patrón que clinics.max_users). NULL = sin tope: comportamiento
-- actual, sin cambios para ninguna clínica existente. El superadmin lo
-- activa clínica por clínica desde /superadmin cuando quiere usarlo como
-- gancho comercial.
-- Spec: docs/superpowers/specs/2026-07-20-limite-pacientes-plan-design.md
--
-- Nota de numeración: en main el último número es 0090. La migración
-- 0091_shared_practice.sql del feature "consultorio compartido" vive solo
-- en su rama/worktree, todavía sin mergear. Si esa rama se mergea antes que
-- esta, renumerar este archivo a 0092.

alter table clinics
  add column if not exists max_patients integer;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Aplicar la migración en local**

Run: `npx supabase migration up`
Expected: `Applying migration 0091_max_patients.sql...` sin errores. (Si el stack local no está corriendo: `npx supabase start` primero. Si la CLI dice que una migración previa "already exists" por historial desincronizado, ver `docs/DEPLOY-MIGRACIONES.md` — no es un problema de este archivo.)

- [ ] **Step 3: Verificar la columna**

Run: `npx supabase db psql -c "select column_name, data_type, is_nullable from information_schema.columns where table_name = 'clinics' and column_name = 'max_patients';"`

(Si `db psql` no existe en esta versión del CLI: `docker exec supabase_db_dentalsaas psql -U postgres -c "..."` con el mismo SQL.)
Expected: una fila `max_patients | integer | YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0091_max_patients.sql
git commit -m "feat(db): tope de pacientes por clinica (upsell)"
```

---

### Task 2: Server action `setMaxPatients`

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts` (insertar después de `setPhotoQuota`, que termina en la línea 271, antes del comentario `// ── Cambiar plan ─` de la línea 273)

**Interfaces:**
- Consumes: columna `clinics.max_patients` (Task 1).
- Produces: `setMaxPatients(_prev: unknown, formData: FormData): Promise<{ error: string } | { ok: true }>` — la Task 3 la consume desde `MaxPatientsInput`.

- [ ] **Step 1: Implementar la action**

Insertar en `app/(dashboard)/superadmin/actions.ts`, inmediatamente después del cierre de `setPhotoQuota` (línea 271) y antes de `// ── Cambiar plan ─────`:

```typescript
// ── Tope de pacientes por clínica (upsell) ───────────────────────────────────
// Campo vacío = sin tope (null, columna clinics.max_patients). El superadmin
// lo usa como palanca comercial: activa el número cuando quiere que la
// clínica vea el aviso de upgrade en /pacientes.
export async function setMaxPatients(_prev: unknown, formData: FormData) {
  await assertSuperadmin();
  const clinicId = String(formData.get("clinicId") ?? "");
  if (!clinicId) return { error: "Valor inválido" };

  const raw = String(formData.get("maxPatients") ?? "").trim();
  let maxPatients: number | null;
  if (raw === "") {
    maxPatients = null;
  } else {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return { error: "Valor inválido" };
    maxPatients = n;
  }

  const admin = createAdminClient();
  await admin.from("clinics").update({ max_patients: maxPatients }).eq("id", clinicId);
  revalidatePath("/superadmin");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (la función no se usa todavía, pero debe compilar sola).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/superadmin/actions.ts"
git commit -m "feat(superadmin): action para tope de pacientes por clinica"
```

---

### Task 3: Panel de superadmin — editor inline y conteo por clínica

**Files:**
- Create: `components/superadmin/MaxPatientsInput.tsx`
- Modify: `components/superadmin/ClinicList.tsx` (import línea 16-22, tipo `ClinicRow` líneas 26-38, render líneas 170-181)
- Modify: `app/(dashboard)/superadmin/page.tsx` (select línea 44, `Promise.all` líneas 61-72, mapeo de `rows` líneas 159-171)

**Interfaces:**
- Consumes: `setMaxPatients` (Task 2), columna `clinics.max_patients` (Task 1).
- Produces: `ClinicRow.max_patients: number | null` y `ClinicRow.patientCount: number` — no consumidos por otras tareas de este plan.

- [ ] **Step 1: Crear `components/superadmin/MaxPatientsInput.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil } from "lucide-react";
import { setMaxPatients } from "@/app/(dashboard)/superadmin/actions";

type State = { error?: string; ok?: boolean };
const initial: State = {};

// Tope de pacientes por clínica (palanca de upsell manual del superadmin).
// null = sin tope: se muestra solo el conteo, sin fracción, invitando a
// activarlo con el mismo click de edición.
export function MaxPatientsInput({
  clinicId,
  maxPatients,
  currentCount,
}: {
  clinicId: string;
  maxPatients: number | null;
  currentCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(setMaxPatients, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!editing) {
    const overLimit = maxPatients !== null && currentCount >= maxPatients;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Cambiar tope de pacientes"
        className="group flex items-center gap-1 text-xs text-slate-500 hover:text-clinic"
      >
        <span className={overLimit ? "font-semibold text-red-600" : ""}>{currentCount}</span>
        {maxPatients !== null && (
          <>
            <span className="text-slate-400">/</span>
            <span>{maxPatients}</span>
          </>
        )}
        <span className="text-slate-400">paciente{currentCount !== 1 ? "s" : ""}</span>
        <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="clinicId" value={clinicId} />
      <span className="text-xs text-slate-500">{currentCount} /</span>
      <input
        ref={inputRef}
        name="maxPatients"
        type="number"
        min="0"
        defaultValue={maxPatients ?? ""}
        placeholder="sin tope"
        className="w-20 rounded border border-clinic px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-clinic"
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded p-0.5 text-clinic hover:bg-clinic/10 disabled:opacity-50"
        title="Guardar"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
```

- [ ] **Step 2: Extender `ClinicRow` y agregar el import en `components/superadmin/ClinicList.tsx`**

En el bloque de imports (después de la línea 17, junto a `PhotoQuotaInput`):

```typescript
import { MaxPatientsInput } from "@/components/superadmin/MaxPatientsInput";
```

En el tipo `ClinicRow` (líneas 26-38), agregar dos campos:

```typescript
export type ClinicRow = {
  id: string;
  name: string;
  plan: string;
  features: Features;
  photoQuota: number;
  photoUsed: number;
  active: boolean;
  max_users: number;
  max_patients: number | null;
  patientCount: number;
  created_at: string;
  users: ClinicUser[];
  settings: Record<string, unknown>;
};
```

- [ ] **Step 3: Renderizar `MaxPatientsInput` en la fila de encabezado**

En `components/superadmin/ClinicList.tsx`, dentro del `<div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">` (línea 170), agregar el bloque justo después del `</span>` que cierra `MaxUsersInput` (línea 178) y antes del separador `·` (línea 179):

```tsx
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <MaxUsersInput
                  clinicId={c.id}
                  maxUsers={c.max_users ?? 10}
                  currentCount={c.users.filter((u) => u.active).length}
                />
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1">
                <MaxPatientsInput
                  clinicId={c.id}
                  maxPatients={c.max_patients}
                  currentCount={c.patientCount}
                />
              </span>
              <span className="text-slate-300">·</span>
              <span>{new Date(c.created_at).toLocaleDateString("es-BO")}</span>
```

(Reemplaza el bloque original de las líneas 171-181, que solo tenía `MaxUsersInput` seguido de la fecha, agregando el nuevo `<span>` de pacientes entre medio.)

- [ ] **Step 4: Conteo de pacientes y columna en `app/(dashboard)/superadmin/page.tsx`**

En el select de clínicas (línea 42-44), agregar `max_patients`:

```typescript
  let clinicsQuery = admin
    .from("clinics")
    .select("id, name, plan, features, active, max_users, max_patients, created_at, settings");
```

En el `Promise.all` (líneas 53-72), agregar una query de pacientes (mismo patrón que `patient_photos` en la línea 66) y su resultado desestructurado:

```typescript
  const [
    { data: clinics },
    { data: profiles },
    { data: authList },
    { data: platformAdmins },
    { data: allPhotos },
    { data: allPatients },
    supaStats,
    { data: backupRows },
  ] = await Promise.all([
    clinicsQuery,
    admin.from("profiles").select("id, clinic_id, full_name, role, active"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("platform_admins").select("user_id"),
    admin.from("patient_photos").select("clinic_id, size_bytes"),
    admin.from("patients").select("clinic_id"),
    getSupabaseStorageStats(),
    admin
      .from("backup_runs")
      .select("clinic_id, status, size_bytes, created_at, storage_key")
      .order("created_at", { ascending: false }),
  ]);
```

Después del bloque de `photoCounts` (líneas 110-119), agregar el agregado de pacientes por clínica:

```typescript
  // Conteo real de pacientes por clínica, para el tope de upsell.
  const patientCounts = new Map<string, number>();
  for (const p of allPatients ?? []) {
    const cid = p.clinic_id as string;
    patientCounts.set(cid, (patientCounts.get(cid) ?? 0) + 1);
  }
```

En el mapeo de `rows` (líneas 159-171), agregar los dos campos nuevos:

```typescript
  const rows: ClinicRow[] = (clinics ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    features: normalizeFeatures(c.features),
    photoQuota: photoQuota(c.features),
    photoUsed: photoCounts.get(c.id) ?? 0,
    active: c.active !== false,
    max_users: c.max_users ?? 10,
    max_patients: (c as { max_patients: number | null }).max_patients ?? null,
    patientCount: patientCounts.get(c.id) ?? 0,
    created_at: c.created_at,
    users: usersByClinic.get(c.id) ?? [],
    settings: (c.settings as Record<string, unknown>) ?? {},
  }));
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Prueba manual**

Con el stack local corriendo (`npx supabase start` si hace falta) y sesión de superadmin: abrir `/superadmin`, confirmar que cada tarjeta de clínica muestra "N pacientes" (sin tope) junto al conteo de usuarios. Click para editar, escribir un número menor al conteo actual, guardar: el badge debe pasar a rojo ("N / M pacientes"). Borrar el campo y guardar de nuevo: vuelve a "sin tope".

- [ ] **Step 7: Commit**

```bash
git add components/superadmin/MaxPatientsInput.tsx components/superadmin/ClinicList.tsx "app/(dashboard)/superadmin/page.tsx"
git commit -m "feat(superadmin): editor de tope de pacientes y conteo por clinica"
```

---

### Task 4: Banner de upsell en `/pacientes`

**Files:**
- Modify: `app/(dashboard)/pacientes/page.tsx` (imports línea 1-16, lógica después de la línea 42, JSX después de `PageHeader` línea 115)

**Interfaces:**
- Consumes: columna `clinics.max_patients` (Task 1), `usageLevel()` de `lib/storageLimits.ts`.
- Produces: nada consumido por otras tareas.

- [ ] **Step 1: Agregar imports**

En `app/(dashboard)/pacientes/page.tsx`, agregar a los imports existentes (después de la línea 16, `import { PageHeader } from "@/components/ui/PageHeader";`):

```typescript
import { AlertTriangle } from "lucide-react";
import { usageLevel } from "@/lib/storageLimits";
```

- [ ] **Step 2: Calcular el aviso**

Después del bloque `isDoctor` (línea 42, `profile?.role === "odontologo_general" || profile?.role === "especialista";`), agregar:

```typescript
  // Aviso de upsell: solo el admin decide sobre el plan. Se calcula aparte
  // del listado (que puede estar filtrado por búsqueda `q`) para reflejar
  // siempre el conteo TOTAL de pacientes de la clínica, no el filtrado.
  let patientLimitAlert: { count: number; max: number; level: "warn" | "danger" } | null = null;
  if (profile?.role === "admin" && profile.clinicId) {
    const [{ count: totalPatients }, { data: clinicRow }] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase.from("clinics").select("max_patients").eq("id", profile.clinicId).single(),
    ]);
    const maxPatients = (clinicRow as { max_patients: number | null } | null)?.max_patients ?? null;
    if (maxPatients !== null && totalPatients !== null) {
      const level = usageLevel(totalPatients, maxPatients);
      if (level !== "ok") patientLimitAlert = { count: totalPatients, max: maxPatients, level };
    }
  }
```

- [ ] **Step 3: Renderizar el banner**

En el JSX, justo después de `<PageHeader ... />` (línea 115, antes de `{canRegister && <NewPatientForm />}`):

```tsx
      {patientLimitAlert && (
        <div
          className={`flex items-center gap-2 rounded-xl p-4 text-sm font-medium ring-1 ${
            patientLimitAlert.level === "danger"
              ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300"
              : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Estás usando{" "}
            <strong>
              {patientLimitAlert.count} de {patientLimitAlert.max}
            </strong>{" "}
            pacientes de tu plan. Contáctanos para subir de plan.
          </span>
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/pacientes/page.tsx"
git commit -m "feat(pacientes): banner de upsell al acercarse al tope de pacientes"
```

---

### Task 5: Verificación end-to-end

**Files:**
- Ninguno nuevo (verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde (no se agregaron tests nuevos — ver Global Constraints — pero la suite existente no debe romperse).

- [ ] **Step 2: Verificación manual con datos reales (stack local)**

Con el stack local corriendo, elegir una clínica de prueba y su admin (ver `docker exec supabase_db_dentalsaas psql -U postgres -c "select id, name from clinics;"` para los ids). Fijar un tope bajo a mano:

```sql
update clinics set max_patients = 3 where id = '<clinic-id-de-prueba>';
```

Confirmar cuántos pacientes tiene esa clínica (`select count(*) from patients where clinic_id = '<clinic-id-de-prueba>';`). Si el conteo es ≥80% de 3 (es decir, ≥3), logueado como **admin** de esa clínica: `/pacientes` debe mostrar el banner (ámbar si <90%, rojo si ≥90%). Logueado como **recepcionista** o **doctor** de la misma clínica: el banner NO debe aparecer (solo admin lo ve). Confirmar también que se puede seguir creando pacientes sin bloqueo, aunque el conteo supere el tope.

- [ ] **Step 3: Revertir los datos de prueba**

```sql
update clinics set max_patients = null where id = '<clinic-id-de-prueba>';
```

- [ ] **Step 4: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "test(pacientes): verificacion manual del tope de pacientes"
```
