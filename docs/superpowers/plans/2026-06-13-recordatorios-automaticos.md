# Recordatorios Automáticos de Citas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Addon premium `recordatorios` que envía recordatorios de cita por WhatsApp (24h y/o 2h antes), configurable por clínica desde Ajustes.

**Architecture:** Feature flag opt-in `recordatorios` en `clinics.features`; configuración de timings en `clinics.settings` (`reminders_h24`, `reminders_h2`); múltiples filas en `appointment_reminders` (una por timing habilitado); cron horario de Vercel que procesa las filas pendientes; panel en Ajustes para configurar y monitorear.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS + admin client), Tailwind CSS, TypeScript, Vercel Cron.

---

## Contexto del codebase (leer antes de implementar)

- `clinics.settings` JSONB ya existe en el schema (`0001_schema.sql` línea 39). **No** hay que crearlo.
- `appointment_reminders` ya tiene índice `idx_reminders_due on (status, scheduled_for)`. **No** duplicar.
- El cron actual (diario) está en `app/api/cron/reminders/route.ts`. Usa `sendWhatsAppTemplate` de `lib/whatsapp.ts` vía Meta Cloud API. **No** tocar la lógica de envío.
- `lib/features.ts` ya tiene el patrón opt-in con `normalizeFeatures` dinámico — agregar a `FEATURES` es suficiente.
- `app/(dashboard)/ajustes/actions.ts` tiene un helper privado `assertClinicAdmin()` que devuelve `{ profile }` o `{ error }`. Usarlo para la nueva action.
- Las Server Actions en ajustes usan `createClient()` (sesión del usuario, RLS activo), **excepto** cuando modifican `clinics` directamente — en ese caso usan `createAdminClient()` para eludir RLS. Para `saveRemindersConfig` se puede usar `createClient()` si RLS permite `UPDATE` en `clinics` para el propio `clinic_id`. Por consistencia con `updateClinicProfile` que usa `createAdminClient()`, usar `createAdminClient()` en `saveRemindersConfig`.

## File Map

| File | Acción | Responsabilidad |
|------|--------|----------------|
| `supabase/migrations/0038_reminders_config.sql` | Crear | Agrega columna `hours_before integer` a `appointment_reminders` |
| `lib/features.ts` | Modificar | Agrega `"recordatorios"` al catálogo de feature flags |
| `lib/reminders.ts` | Crear | Helpers `buildReminderRows` y `cancelPendingReminders` |
| `app/(dashboard)/agenda/actions.ts` | Modificar | `createAppointment`, `updateAppointment`, `cancelAppointment`, `rescheduleAppointment` usan los nuevos helpers |
| `app/api/cron/reminders/route.ts` | Modificar | Guard por feature flag por clínica + `features` en el select |
| `vercel.json` | Modificar | Cambia schedule a `"0 * * * *"` (cada hora) |
| `components/ajustes/RemindersPanel.tsx` | Crear | Componente cliente: checkboxes de config + tabla de estado reciente |
| `app/(dashboard)/ajustes/actions.ts` | Modificar | Agrega `saveRemindersConfig` server action |
| `app/(dashboard)/ajustes/page.tsx` | Modificar | Carga datos y renderiza `RemindersPanel` en orden correcto |

---

## Task 1: SQL migration

**Files:**
- Create: `supabase/migrations/0038_reminders_config.sql`

- [ ] **Step 1: Crear el archivo de migración**

Contenido completo de `supabase/migrations/0038_reminders_config.sql`:

```sql
-- Identifica qué timing generó cada fila: 24 (24h antes) o 2 (2h antes).
-- NULL en filas creadas antes de este addon (retrocompatible).
alter table appointment_reminders
  add column if not exists hours_before integer;
```

- [ ] **Step 2: Aplicar en producción (Supabase nube)**

Abrir el SQL Editor del dashboard de Supabase (proyecto de producción) y ejecutar el contenido del archivo:

```sql
alter table appointment_reminders
  add column if not exists hours_before integer;
```

Expected: "Success. No rows returned." Si la columna ya existe, `IF NOT EXISTS` la omite sin error.

- [ ] **Step 3: Aplicar en local (opcional, si se usa Supabase local)**

```bash
npx supabase db push
```

Expected: Sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0038_reminders_config.sql
git commit -m "feat(db): columna hours_before en appointment_reminders"
```

---

## Task 2: Feature flag `recordatorios`

**Files:**
- Modify: `lib/features.ts`

El archivo actual tiene `FeatureKey` como union type y `FEATURES` como array. `normalizeFeatures` ya itera sobre el array dinámicamente — no hay switch hardcodeado que rompa.

- [ ] **Step 1: Agregar `"recordatorios"` al tipo `FeatureKey`**

En `lib/features.ts`, agregar `| "recordatorios"` al final del union type (después de `| "consentimientos"`):

```typescript
export type FeatureKey =
  | "agenda"
  | "pacientes"
  | "mis_trabajos"
  | "tratamientos"
  | "caja"
  | "inventario"
  | "ajustes"
  | "whatsapp"
  | "recetas"
  | "pagos"
  | "perfil"
  | "consentimientos"
  | "recordatorios";
```

- [ ] **Step 2: Agregar entrada en el array `FEATURES`**

En `lib/features.ts`, agregar la entrada **después** de la línea de `consentimientos`:

```typescript
  { key: "consentimientos", label: "Consentimientos", href: "/pacientes", optIn: true },
  { key: "recordatorios", label: "Recordatorios WhatsApp", href: "/ajustes", optIn: true },
```

- [ ] **Step 3: Verificar que TypeScript compila sin errores**

```bash
npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/features.ts
git commit -m "feat(features): feature flag opt-in recordatorios"
```

---

## Task 3: Módulo `lib/reminders.ts`

**Files:**
- Create: `lib/reminders.ts`

- [ ] **Step 1: Crear el módulo con ambas funciones exportadas**

Crear `lib/reminders.ts` con este contenido exacto:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

type ReminderInsert = {
  clinic_id: string;
  appointment_id: string;
  channel: "whatsapp";
  scheduled_for: string;
  hours_before: number;
};

const TIMINGS = [
  { key: "reminders_h24", hours: 24, defaultOn: true },
  { key: "reminders_h2",  hours: 2,  defaultOn: false },
] as const;

/**
 * Calcula las filas a insertar en appointment_reminders según la config de la clínica.
 * Retorna solo las filas para timings habilitados.
 * Si el scheduled_for ya pasó (cita en menos tiempo del reminder), usa `now`.
 */
export function buildReminderRows(
  clinicId: string,
  appointmentId: string,
  startsAt: Date,
  settings: Record<string, unknown>,
): ReminderInsert[] {
  const now = new Date();
  const rows: ReminderInsert[] = [];

  for (const t of TIMINGS) {
    const enabled = t.defaultOn
      ? settings[t.key] !== false
      : settings[t.key] === true;
    if (!enabled) continue;

    const remindAt = new Date(startsAt.getTime() - t.hours * 60 * 60 * 1000);
    rows.push({
      clinic_id: clinicId,
      appointment_id: appointmentId,
      channel: "whatsapp",
      scheduled_for: (remindAt > now ? remindAt : now).toISOString(),
      hours_before: t.hours,
    });
  }

  return rows;
}

/**
 * Cancela los recordatorios pendientes de una cita antes de reinsertar
 * (al reagendar) o de marcar la cita como cancelada.
 * Solo toca filas con status='pending'; las ya enviadas quedan intactas.
 */
export async function cancelPendingReminders(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  await supabase
    .from("appointment_reminders")
    .update({ status: "cancelled" })
    .eq("appointment_id", appointmentId)
    .eq("status", "pending");
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Sin errores. `SupabaseClient` viene de `@supabase/supabase-js` que ya es dependencia del proyecto.

- [ ] **Step 3: Commit**

```bash
git add lib/reminders.ts
git commit -m "feat(reminders): helpers buildReminderRows y cancelPendingReminders"
```

---

## Task 4: Actualizar `agenda/actions.ts`

**Files:**
- Modify: `app/(dashboard)/agenda/actions.ts`

**Objetivo:** Reemplazar el bloque hard-coded de 24h en `createAppointment`; agregar cancel/reinsert en `updateAppointment`, `cancelAppointment` y `rescheduleAppointment`.

- [ ] **Step 1: Agregar imports al principio del archivo**

Después de `import { can } from "@/lib/rbac";` (última línea de imports, alrededor de línea 7), agregar:

```typescript
import { normalizeFeatures } from "@/lib/features";
import { buildReminderRows, cancelPendingReminders } from "@/lib/reminders";
```

- [ ] **Step 2: Reemplazar el bloque hard-coded en `createAppointment`**

Localizar el bloque de recordatorio actual en `createAppointment` (líneas ~105-114):

```typescript
  // Recordatorio automático 24h antes (lo despacha la Edge Function vía pg_cron).
  // Si la cita es en menos de 24h, se programa de inmediato.
  const remindAt = new Date(starts.getTime() - 24 * 60 * 60 * 1000);
  const scheduledFor = remindAt > new Date() ? remindAt : new Date();
  await supabase.from("appointment_reminders").insert({
    clinic_id: profile.clinicId,
    appointment_id: appt.id,
    channel: "whatsapp",
    scheduled_for: scheduledFor.toISOString(),
  });
```

Reemplazar exactamente ese bloque por:

```typescript
  // Recordatorios automáticos: solo si el addon está activo y hay paciente registrado.
  if (parsed.data.patient_id) {
    const { data: clinicRow } = await supabase
      .from("clinics")
      .select("features, settings")
      .eq("id", profile.clinicId)
      .single();

    if (normalizeFeatures(clinicRow?.features).recordatorios) {
      const settings = (clinicRow?.settings ?? {}) as Record<string, unknown>;
      const rows = buildReminderRows(profile.clinicId, appt.id, starts, settings);
      if (rows.length > 0) {
        await supabase.from("appointment_reminders").insert(rows);
      }
    }
  }
```

- [ ] **Step 3: Actualizar `cancelAppointment` para cancelar reminders pendientes**

Localizar la función `cancelAppointment`. Después de `if (error) return { error: error.message };` y antes de `revalidatePath("/agenda");`, insertar:

```typescript
  await cancelPendingReminders(supabase, id);
```

La función completa queda:

```typescript
export async function cancelAppointment(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  await cancelPendingReminders(supabase, id);

  revalidatePath("/agenda");
  return { ok: true };
}
```

- [ ] **Step 4: Actualizar `updateAppointment` para reinsertar reminders al editar**

En `updateAppointment`, después de `if (error) return { error: error.message };` y antes de `revalidatePath("/agenda");`, insertar:

```typescript
  // Si el paciente está registrado y el addon activo, reinsertar reminders con la nueva hora.
  if (parsed.data.patient_id) {
    const { data: clinicRow } = await supabase
      .from("clinics")
      .select("features, settings")
      .eq("id", profile.clinicId)
      .single();

    if (normalizeFeatures(clinicRow?.features).recordatorios) {
      await cancelPendingReminders(supabase, appointmentId);
      const settings = (clinicRow?.settings ?? {}) as Record<string, unknown>;
      const rows = buildReminderRows(profile.clinicId, appointmentId, starts, settings);
      if (rows.length > 0) {
        await supabase.from("appointment_reminders").insert(rows);
      }
    }
  }
```

- [ ] **Step 5: Actualizar `rescheduleAppointment` para reagendar reminders**

En `rescheduleAppointment`, después de `if (error) return { error: error.message };` y antes de `revalidatePath("/agenda");`, insertar:

```typescript
  // Reinsertar reminders con la nueva hora si el addon está activo.
  const { data: apptRow } = await supabase
    .from("appointments")
    .select("patient_id, clinics(features, settings)")
    .eq("id", id)
    .single();

  const patientId = apptRow?.patient_id;
  const clinicData = apptRow?.clinics as { features?: unknown; settings?: unknown } | null;

  if (patientId && normalizeFeatures(clinicData?.features).recordatorios) {
    await cancelPendingReminders(supabase, id);
    const settings = (clinicData?.settings ?? {}) as Record<string, unknown>;
    const rows = buildReminderRows(profile.clinicId, id, new Date(startsUTC), settings);
    if (rows.length > 0) {
      await supabase.from("appointment_reminders").insert(rows);
    }
  }
```

- [ ] **Step 6: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/agenda/actions.ts
git commit -m "feat(agenda): recordatorios configurables al crear/editar/cancelar/reagendar citas"
```

---

## Task 5: Cron horario + guard de feature flag

**Files:**
- Modify: `vercel.json`
- Modify: `app/api/cron/reminders/route.ts`

- [ ] **Step 1: Cambiar el schedule en `vercel.json` a cada hora**

Reemplazar el contenido completo de `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```

(Antes era `"0 13 * * *"` — una vez al día. Ahora corre todos los minutos `:00` de cada hora.)

- [ ] **Step 2: Agregar import de `normalizeFeatures` en el cron**

En `app/api/cron/reminders/route.ts`, después de las importaciones existentes (después de `import { BOLIVIA_TZ } from "@/lib/format";`), agregar:

```typescript
import { normalizeFeatures } from "@/lib/features";
```

- [ ] **Step 3: Agregar `features` al tipo `ReminderRow`**

En `app/api/cron/reminders/route.ts`, actualizar el tipo `ReminderRow` para incluir `features`:

```typescript
type ReminderRow = {
  id: string;
  appointment_id: string;
  appointments: {
    starts_at: string;
    status: string;
    dentist_name: string | null;
    patients: { full_name: string | null; phone: string | null } | null;
    clinics: { name: string | null; features: unknown } | null;
  } | null;
};
```

- [ ] **Step 4: Agregar `features` al query select del cron**

En la función `GET`, en el `.select(...)` del query principal (alrededor de línea 50), agregar `features` a `clinics`:

```typescript
  const { data, error } = await supabase
    .from("appointment_reminders")
    .select(
      "id, appointment_id, appointments(starts_at, status, dentist_name, patients(full_name, phone), clinics(name, features))",
    )
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(100);
```

- [ ] **Step 5: Agregar guard de feature flag en el loop**

En el `for (const r of due)` loop, después del bloque `if (!appt || appt.status === "cancelled")`, agregar el guard de feature:

```typescript
    // Guard: clínica sin addon recordatorios activo → saltar sin marcar fallido.
    // (el addon puede haberse desactivado después de que se programó el reminder)
    const clinicFeatures = normalizeFeatures(appt.clinics?.features);
    if (!clinicFeatures.recordatorios) {
      skipped++;
      continue;
    }
```

El loop completo (con el guard en el lugar correcto) queda:

```typescript
  for (const r of due) {
    const appt = r.appointments;

    // Cita inexistente o cancelada: no se envía y no se reintenta.
    if (!appt || appt.status === "cancelled") {
      await markFailed(supabase, r.id);
      skipped++;
      continue;
    }

    // Guard: clínica sin addon recordatorios activo → saltar sin marcar fallido.
    const clinicFeatures = normalizeFeatures(appt.clinics?.features);
    if (!clinicFeatures.recordatorios) {
      skipped++;
      continue;
    }

    const phone = appt.patients?.phone;
    // Sólo pacientes registrados con teléfono (las consultas rápidas no tienen).
    if (!phone) {
      await markFailed(supabase, r.id);
      skipped++;
      continue;
    }

    // ... resto sin cambios (dateLabel, timeLabel, sendWhatsAppTemplate, etc.)
  }
```

- [ ] **Step 6: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 7: Commit**

```bash
git add vercel.json app/api/cron/reminders/route.ts
git commit -m "feat(cron): schedule horario + guard de feature recordatorios por clínica"
```

---

## Task 6: Componente `RemindersPanel`

**Files:**
- Create: `components/ajustes/RemindersPanel.tsx`

Seguir el mismo patrón que `ClinicProfilePanel.tsx`: `"use client"`, `useActionState`, `useEffect` para refresh, form con feedback de estado.

- [ ] **Step 1: Crear el componente**

Crear `components/ajustes/RemindersPanel.tsx` con el contenido siguiente:

```typescript
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveRemindersConfig, type ActionState } from "@/app/(dashboard)/ajustes/actions";

export type ReminderRow = {
  id: string;
  hours_before: number | null;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  appointments: {
    starts_at: string;
    patient_name: string | null;
    patients: { full_name: string | null } | null;
  } | null;
};

const initial: ActionState = {};

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendiente",
  sent:      "Enviado",
  failed:    "Fallido",
  cancelled: "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  sent:      "bg-emerald-100 text-emerald-700",
  failed:    "bg-red-100 text-red-600",
  cancelled: "bg-slate-100 text-slate-500",
};

function hoursLabel(hours: number | null): string {
  if (hours === 2)  return "2h antes";
  if (hours === 24) return "24h antes";
  return "Recordatorio";
}

export function RemindersPanel({
  config,
  recentReminders,
  canWrite,
}: {
  config: { h24: boolean; h2: boolean };
  recentReminders: ReminderRow[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRemindersConfig, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-4">
      {/* Configuración de timings */}
      <form
        action={formAction}
        className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
      >
        <div className="space-y-3 p-5">
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="reminders_h24"
              defaultChecked={config.h24}
              disabled={!canWrite}
              className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
            />
            <span className="text-slate-700">Recordatorio 24 horas antes de la cita</span>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="reminders_h2"
              defaultChecked={config.h2}
              disabled={!canWrite}
              className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
            />
            <span className="text-slate-700">Recordatorio 2 horas antes de la cita</span>
          </label>
        </div>

        {canWrite && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            {state.ok && !state.error && (
              <p className="text-sm text-emerald-600">Configuración guardada.</p>
            )}
            {!state.error && !state.ok && <span />}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        )}
      </form>

      {/* Historial reciente */}
      {recentReminders.length > 0 ? (
        <div className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Últimos 7 días
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Paciente</th>
                  <th className="px-4 py-2 text-left font-medium">Cita</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReminders.map((r) => {
                  const appt = r.appointments;
                  const patientName =
                    appt?.patients?.full_name ?? appt?.patient_name ?? "—";
                  const apptDate = appt?.starts_at
                    ? new Date(appt.starts_at).toLocaleString("es-BO", {
                        timeZone: "America/La_Paz",
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  const statusClass =
                    STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{patientName}</td>
                      <td className="px-4 py-2 text-slate-500">{apptDate}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {hoursLabel(r.hours_before)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">
          No hay recordatorios en los últimos 7 días.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Puede haber un error temporal sobre `saveRemindersConfig` si aún no existe — se resolverá en Task 7. Si ya existe, sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ajustes/RemindersPanel.tsx
git commit -m "feat(ui): RemindersPanel con config de timings y tabla de estado"
```

---

## Task 7: Server action `saveRemindersConfig`

**Files:**
- Modify: `app/(dashboard)/ajustes/actions.ts`

`assertClinicAdmin()` es un helper privado en ese archivo. `ActionState` ya está exportada. `createAdminClient` ya está importado (para `updateClinicProfile`).

- [ ] **Step 1: Agregar `saveRemindersConfig` al final del archivo**

Al final de `app/(dashboard)/ajustes/actions.ts`, después de la función `removeTeamUser`, agregar:

```typescript
// ============================================================================
// Recordatorios WhatsApp (addon "recordatorios").
// ============================================================================

export async function saveRemindersConfig(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await assertClinicAdmin();
  if ("error" in auth) return { error: auth.error };
  const { profile } = auth;

  const h24 = formData.get("reminders_h24") === "on";
  const h2  = formData.get("reminders_h2")  === "on";

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("settings")
    .eq("id", profile.clinicId)
    .single();

  const existing = (clinic?.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("clinics")
    .update({ settings: { ...existing, reminders_h24: h24, reminders_h2: h2 } })
    .eq("id", profile.clinicId);

  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/ajustes/actions.ts
git commit -m "feat(actions): saveRemindersConfig para guardar timings de recordatorios"
```

---

## Task 8: Integrar `RemindersPanel` en la página de Ajustes

**Files:**
- Modify: `app/(dashboard)/ajustes/page.tsx`

**Orden final de la página:** Perfil de la clínica → **Recordatorios WhatsApp** → Plantillas de consentimiento → Usuarios del equipo.

- [ ] **Step 1: Agregar el import de `RemindersPanel`**

En `app/(dashboard)/ajustes/page.tsx`, después de los imports existentes (la última línea de imports es `import { getClinicFeatures } from "@/lib/superadmin";`), agregar:

```typescript
import { RemindersPanel, type ReminderRow } from "@/components/ajustes/RemindersPanel";
```

- [ ] **Step 2: Agregar la carga de datos de recordatorios**

En la función `SettingsPage`, después del bloque de `clinicProfile` (que termina con el `}` de `if (isClinicAdmin && features.perfil && profile)`) y antes de `let systemTemplates`, insertar:

```typescript
  // Recordatorios WhatsApp (addon "recordatorios").
  let remindersConfig = { h24: true, h2: false };
  let recentReminders: ReminderRow[] = [];

  if (isClinicAdmin && features.recordatorios && profile) {
    const { data: clinicData } = await supabase
      .from("clinics")
      .select("settings")
      .eq("id", profile.clinicId)
      .single();

    const s = (clinicData?.settings ?? {}) as Record<string, unknown>;
    remindersConfig = {
      h24: s.reminders_h24 !== false,
      h2:  s.reminders_h2  === true,
    };

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("appointment_reminders")
      .select(
        "id, hours_before, status, scheduled_for, sent_at, appointments(starts_at, patient_name, patients(full_name))",
      )
      .eq("clinic_id", profile.clinicId)
      .gte("scheduled_for", since)
      .order("scheduled_for", { ascending: false })
      .limit(20);

    recentReminders = (recent ?? []) as ReminderRow[];
  }
```

- [ ] **Step 3: Insertar el bloque JSX de `RemindersPanel`**

En el `return (...)`, después del bloque `{clinicProfile && (...)}` y antes del bloque `{isClinicAdmin && features.consentimientos && profile && (...)}`, insertar:

```typescript
      {isClinicAdmin && features.recordatorios && profile && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">
            Recordatorios automáticos de WhatsApp
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Envía recordatorios automáticos a tus pacientes por WhatsApp antes de su cita.
            Solo aplica a pacientes registrados con número de teléfono.
          </p>
          <RemindersPanel
            config={remindersConfig}
            recentReminders={recentReminders}
            canWrite={canWrite}
          />
        </section>
      )}
```

- [ ] **Step 4: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 5: Iniciar el servidor de desarrollo y probar la UI**

```bash
npm run dev
```

Checklist de verificación manual:

1. Ir a `/ajustes` con una cuenta admin. Si `recordatorios` NO está activo para la clínica: la sección no debe aparecer.
2. Ir a `/superadmin`, activar el addon `Recordatorios WhatsApp` para la clínica de prueba.
3. Refrescar `/ajustes`: la sección **"Recordatorios automáticos de WhatsApp"** debe aparecer entre el perfil y los consentimientos.
4. El checkbox de 24h debe estar marcado, el de 2h desmarcado.
5. Marcar también "2 horas antes" → "Guardar configuración" → mensaje "Configuración guardada."
6. Verificar en Supabase SQL Editor que `clinics.settings` tiene `{"reminders_h24": true, "reminders_h2": true}`.
7. Crear una cita nueva con un paciente registrado. Verificar en `appointment_reminders` que se crearon 2 filas (hours_before=24 y hours_before=2).
8. Cancelar esa cita. Verificar que las 2 filas en `appointment_reminders` cambian a `status='cancelled'`.

- [ ] **Step 6: Commit final**

```bash
git add app/(dashboard)/ajustes/page.tsx
git commit -m "feat(ajustes): RemindersPanel con config y estado de recordatorios automáticos"
```

---

## Resumen de commits (en orden)

1. `feat(db): columna hours_before en appointment_reminders`
2. `feat(features): feature flag opt-in recordatorios`
3. `feat(reminders): helpers buildReminderRows y cancelPendingReminders`
4. `feat(agenda): recordatorios configurables al crear/editar/cancelar/reagendar citas`
5. `feat(cron): schedule horario + guard de feature recordatorios por clínica`
6. `feat(ui): RemindersPanel con config de timings y tabla de estado`
7. `feat(actions): saveRemindersConfig para guardar timings de recordatorios`
8. `feat(ajustes): RemindersPanel con config y estado de recordatorios automáticos`
