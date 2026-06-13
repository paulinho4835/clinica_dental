# Recordatorios Automáticos de Citas — Diseño

> **Para workers agénticos:** usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea.

**Goal:** Addon premium `recordatorios` que envía recordatorios de cita por WhatsApp (24h y/o 2h antes), configurable por clínica desde Ajustes.

**Architecture:** Múltiples filas en `appointment_reminders` (una por timing habilitado) + cron horario en Vercel que procesa las filas pendientes + panel en Ajustes para configurar y monitorear.

**Tech Stack:** Next.js App Router, Supabase, Tailwind CSS, TypeScript, WhatsApp (canal existente), Vercel Cron.

---

## Estado previo (qué ya existe)

- Tabla `appointment_reminders` con columnas: `id`, `clinic_id`, `appointment_id`, `channel`, `status` (`pending`/`sent`/`failed`), `scheduled_for`, `sent_at`, `vapi_call_id`.
- `agenda/actions.ts::createAppointment` ya inserta 1 fila a 24h antes (hard-coded, sin leer config).
- `/api/cron/reminders` — cron diario a las 09:00 Bolivia que envía por WhatsApp Cloud API.
- `vercel.json` con `"schedule": "0 13 * * *"` (una vez al día).
- `clinics.settings` JSONB vacío por defecto — listo para extender.
- `lib/features.ts` con patrón opt-in ya definido.

---

## Cambios de datos

### 1. Migración SQL (`0038_reminders_config.sql`)

```sql
-- Columna para identificar el tipo de recordatorio
alter table appointment_reminders
  add column if not exists hours_before integer;

-- Índice para el cron (busca pendientes cuya hora llegó)
create index if not exists idx_reminders_cron
  on appointment_reminders(status, scheduled_for)
  where status = 'pending';
```

### 2. Nueva feature key en `lib/features.ts`

```typescript
// Agregar a FeatureKey union:
| "recordatorios"

// Agregar a FEATURES array (opt-in, después de consentimientos):
{ key: "recordatorios", label: "Recordatorios WhatsApp", href: "/ajustes", optIn: true },
```

### 3. Config en `clinics.settings`

La clínica guarda su configuración de timings en el JSONB `clinics.settings`:
```json
{
  "reminders_h24": true,
  "reminders_h2": false
}
```
Valores por defecto cuando el addon se activa: `reminders_h24: true`, `reminders_h2: false`.

---

## Helpers reutilizables (`lib/reminders.ts`)

Módulo nuevo con dos funciones que se usan tanto en `createAppointment` como en `updateAppointment`:

```typescript
// Lee config de la clínica y calcula qué scheduled_for insertar
export function buildReminderRows(
  clinicId: string,
  appointmentId: string,
  startsAt: Date,
  settings: Record<string, unknown>
): Array<{ clinic_id: string; appointment_id: string; channel: string; scheduled_for: string; hours_before: number }>

// Cancela reminders pendientes de una cita (update status = 'cancelled')
export async function cancelPendingReminders(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<void>
```

`buildReminderRows` lee `settings.reminders_h24` y `settings.reminders_h2`, filtra los habilitados y calcula `scheduled_for = startsAt - horasBefore`. Si `startsAt - horasBefore < now`, usa `now` (para citas creadas con menos tiempo de anticipación del reminder).

---

## Cambios en `agenda/actions.ts`

### `createAppointment`
Reemplazar el bloque de inserción de recordatorio hard-coded por:
1. Leer `clinics.settings` de la clínica del perfil.
2. Si el paciente es una consulta rápida (sin `patient_id`), no insertar reminders (no hay teléfono).
3. Llamar `buildReminderRows(...)` y hacer `supabase.from("appointment_reminders").insert(rows)`.

### `updateAppointment`
Cuando cambia `starts_at`:
1. Llamar `cancelPendingReminders(supabase, appointmentId)`.
2. Leer `clinics.settings` y reinsertar con `buildReminderRows(...)`.

Si `starts_at` no cambia, no tocar los reminders.

### `cancelAppointment` (o el update de status a `cancelled`)
Al marcar una cita como cancelada, llamar `cancelPendingReminders(supabase, appointmentId)`.

---

## Cron (`/api/cron/reminders`)

**Cambios:**

1. `vercel.json`: cambiar schedule a `"0 * * * *"` (cada hora).
2. En el handler: antes de enviar cada reminder, verificar que `clinics.features.recordatorios === true`. Si no, saltar sin marcar como fallido (el addon puede estar temporalmente desactivado).
3. El resto de la lógica (WhatsApp, markFailed, markSent) no cambia.

**Guard en el cron:**
```typescript
// Para cada reminder, después del join con appointments/clinics:
const features = normalizeFeatures(clinic?.features);
if (!features.recordatorios) {
  // saltar sin marcar como fallido
  continue;
}
```

---

## UI: `components/ajustes/RemindersPanel.tsx`

Componente client con dos secciones:

### Sección 1: Configuración
```
Recordatorios automáticos de WhatsApp
───────────────────────────────────────
[✓] Recordatorio 24 horas antes de la cita
[ ] Recordatorio 2 horas antes de la cita

[Guardar configuración]
```
Submit llama Server Action `saveRemindersConfig` que hace:
```typescript
await supabase.from("clinics").update({
  settings: { ...existingSettings, reminders_h24, reminders_h2 }
}).eq("id", clinicId)
```

### Sección 2: Estado reciente
Tabla de últimos 20 recordatorios de la clínica (últimos 7 días):

| Paciente | Cita | Tipo | Estado | Enviado |
|---|---|---|---|---|
| Juan Pérez | lun 16 jun 10:00 | 24h | ✅ enviado | 15 jun 10:00 |
| Ana García | mar 17 jun 09:00 | 2h | ⏳ pendiente | — |

Los datos se cargan en el Server Component de Ajustes y se pasan como prop.

---

## Integración en `app/(dashboard)/ajustes/page.tsx`

```typescript
// Importar
import { RemindersPanel, type ReminderRow } from "@/components/ajustes/RemindersPanel";

// Cargar datos si el addon está activo
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
    h24: s.reminders_h24 !== false, // default true
    h2:  s.reminders_h2  === true,  // default false
  };

  const { data: recent } = await supabase
    .from("appointment_reminders")
    .select("id, hours_before, status, scheduled_for, sent_at, appointments(starts_at, patient_name, patients(full_name))")
    .eq("clinic_id", profile.clinicId)
    .gte("scheduled_for", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("scheduled_for", { ascending: false })
    .limit(20);

  recentReminders = (recent ?? []) as ReminderRow[];
}
```

Orden en la página:
1. Perfil de la clínica (addon `perfil`)
2. **Recordatorios WhatsApp (addon `recordatorios`)** ← nuevo
3. Plantillas de consentimiento (addon `consentimientos`)
4. Usuarios del equipo

---

## Server Action: `app/(dashboard)/ajustes/actions.ts`

```typescript
export async function saveRemindersConfig(_prev: unknown, formData: FormData) {
  const profile = await getProfile();
  if (profile?.role !== "admin") return { error: "Sin permiso" };

  const h24 = formData.get("reminders_h24") === "on";
  const h2  = formData.get("reminders_h2")  === "on";

  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings")
    .eq("id", profile.clinicId)
    .single();

  const existing = (clinic?.settings ?? {}) as Record<string, unknown>;
  await supabase.from("clinics").update({
    settings: { ...existing, reminders_h24: h24, reminders_h2: h2 }
  }).eq("id", profile.clinicId);

  revalidatePath("/ajustes");
  return { ok: true };
}
```

---

## Feature flag en superadmin

El addon `recordatorios` aparece en el panel de superadmin igual que los demás opt-in. No requiere cambios en el superadmin — `lib/features.ts` ya lo expone automáticamente en `AddonToggle`.

Para pruebas internas: el superadmin activa el addon para la clínica de prueba desde el panel, sin exponer nada a otras clínicas.

---

## Invariantes y casos borde

| Caso | Comportamiento |
|---|---|
| Consulta rápida (sin `patient_id`) | No se insertan reminders (sin teléfono) |
| Cita en menos de 2h y addon 2h activo | `scheduled_for = now` (se envía en el próximo tick del cron) |
| Cita cancelada | `cancelPendingReminders` marca las filas como `cancelled` |
| Cita reagendada | Cancel + reinsert con nueva hora |
| Addon desactivado temporalmente | Cron salta sin marcar como fallido |
| Clínica sin `reminders_h24` en settings | Default `true` (un solo recordatorio 24h) |

---

## Lo que NO entra en este scope

- Personalización del mensaje de texto
- Respuesta del paciente (confirmar/cancelar por WhatsApp)
- Estadísticas avanzadas (tasa de apertura, ausentismo pre/post)
- Configurar el horario del cron por clínica
- Reminders por SMS o email
