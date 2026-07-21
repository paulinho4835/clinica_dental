# Sync Google Calendar (fase 1: doctores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctor conecta su Google Calendar personal desde Ajustes; cada cita creada, reagendada o cancelada en el sistema se replica automáticamente como evento en su calendario (`primary`). Sync es one-way: sistema → Google. No hay sync inverso.

**Architecture:** OAuth2 por doctor vía `google-auth-library` (solo `OAuth2Client`, no el SDK `googleapis` completo) + llamadas REST directas a Calendar API v3 con `fetch`. Tokens en tabla propia `google_calendar_tokens`, acceso solo vía `createAdminClient()` (service role, bypassa RLS) porque el sync corre en el contexto de la recepcionista pero necesita leer el token del doctor. Los server actions de `agenda/actions.ts` llaman `syncAppointmentToGoogle()` de forma awaited-pero-nunca-fallable (ver Global Constraints).

**Tech Stack:** Next.js App Router (route handlers + server actions), Supabase (Postgres + RLS), `google-auth-library` (nueva dependencia), Vitest.

## Global Constraints

- **Nunca romper la acción de la recepcionista.** Toda llamada a Google Calendar va envuelta en try/catch con `console.error`; el error nunca se propaga al caller.
- **"Fire-and-forget" en la práctica es `await ... .catch(...)` internamente en `syncAppointmentToGoogle`, NO una promesa sin awaitear.** El proyecto deploya en Vercel serverless: una promesa lanzada sin `await` puede morir a mitad de camino cuando la función termina de responder. `syncAppointmentToGoogle` se define de forma que TODO el trabajo (incluido el catch) ocurre dentro de su propio `await`, así que el caller SÍ debe hacer `await syncAppointmentToGoogle(...)` — pero como la función nunca lanza, el caller nunca ve un error ni un retraso más allá de las 1-2 llamadas HTTP reales a Google.
- Español neutro en toda la UI (sin voseo).
- `NUNCA hacer push sin autorización explícita del usuario` (regla del proyecto, no de esta feature — se aplica igual al terminar el plan).
- Todo archivo nuevo de servidor con acceso a secretos/tokens lleva `import "server-only";` en la primera línea (patrón ya usado en `lib/supabase/admin.ts`).

---

## File Structure

- **Migración:** `supabase/migrations/0095_google_calendar.sql` — tabla `google_calendar_tokens`, columna `profiles.google_calendar_connected`, columna `appointments.google_event_id`.
- **Env:** `.env.example` (nuevas vars), `lib/env.ts` (registro + feature group).
- **`lib/google-calendar/eventContent.ts`** — funciones puras: título/descripción del evento. Testeado con Vitest.
- **`lib/google-calendar/client.ts`** — OAuth2Client wrapper + llamadas REST a Calendar API. `isTokenExpired` es pura y testeada; el resto (llamadas de red reales) se verifica manualmente en la Tarea 9, siguiendo la convención del proyecto (no hay mocks de `fetch` en ningún test existente).
- **`lib/google-calendar/tokens.ts`** — helpers de DB (`saveTokens`, `clearTokens`, `ensureFreshAccessToken`) vía `createAdminClient()`.
- **`lib/google-calendar/sync.ts`** — `syncAppointmentToGoogle()` (orquestador) y `backfillDoctorAppointments()`.
- **`app/api/google-calendar/connect/route.ts`** — inicia el flujo OAuth.
- **`app/api/google-calendar/callback/route.ts`** — recibe el `code`, guarda tokens, backfill.
- **`app/(dashboard)/ajustes/google-calendar-actions.ts`** — server action `disconnectGoogleCalendar`.
- **`components/ajustes/GoogleCalendarPanel.tsx`** — UI de conectar/desconectar.
- **Modifica:** `app/(dashboard)/ajustes/page.tsx` (agrega el panel), `app/(dashboard)/agenda/actions.ts` (hooks de sync en las 6 acciones sobre citas), `package.json` (dependencia), `.env.example`, `lib/env.ts`.

---

### Task 1: Fundaciones — migración, env vars, dependencia

**Files:**
- Create: `supabase/migrations/0095_google_calendar.sql`
- Modify: `.env.example`
- Modify: `lib/env.ts`
- Modify: `tests/env.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: tabla `google_calendar_tokens(profile_id, clinic_id, access_token, refresh_token, expires_at, connected_at)`; `profiles.google_calendar_connected boolean`; `appointments.google_event_id text`; `env.GOOGLE_CLIENT_ID`, `env.GOOGLE_CLIENT_SECRET`; dependencia `google-auth-library` instalada.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/0095_google_calendar.sql`:

```sql
-- Vinculación de Google Calendar por doctor: sus citas agendadas en el
-- sistema se replican como eventos en su calendario personal (primary).
-- Sync one-way (sistema -> Google), fase 1 solo doctores.
alter table profiles add column if not exists google_calendar_connected boolean not null default false;
alter table appointments add column if not exists google_event_id text;

create table google_calendar_tokens (
  profile_id    uuid primary key references profiles(id) on delete cascade,
  clinic_id     uuid not null references clinics(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  connected_at  timestamptz not null default now()
);

alter table google_calendar_tokens enable row level security;

-- Defensa en profundidad: la app SIEMPRE accede a esta tabla vía
-- createAdminClient() (service role, bypassa RLS) porque el sync corre en
-- el contexto de la recepcionista y necesita leer el token de OTRO perfil
-- (el doctor). Esta policy es para cualquier acceso directo vía el cliente
-- normal (anon/authenticated): solo el propio doctor ve su fila.
create policy google_calendar_tokens_own on google_calendar_tokens for all
  using (profile_id = auth.uid() and clinic_id = (select auth_clinic_id()))
  with check (profile_id = auth.uid() and clinic_id = (select auth_clinic_id()));
```

- [ ] **Step 2: Aplicar la migración localmente**

Run: `npx supabase migration up --local`
Expected: `Applying migration 0095_google_calendar.sql...` seguido de `Local database is up to date.`

- [ ] **Step 3: Agregar variables de entorno a `.env.example`**

Al final del archivo, agregar:

```
# ── Google Calendar (sync de citas por doctor) ───────────────────────────────
# Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)
# Authorized redirect URI: {NEXT_PUBLIC_SITE_URL}/api/google-calendar/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 4: Registrar las variables en `lib/env.ts`**

En `readEnv()`, después de la línea `VAPI_REMINDER_ASSISTANT_ID: s(src.VAPI_REMINDER_ASSISTANT_ID),`, agregar:

```ts
    GOOGLE_CLIENT_ID: s(src.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: s(src.GOOGLE_CLIENT_SECRET),
```

En `FEATURE_GROUPS`, agregar una entrada:

```ts
  "Google Calendar (sync de citas)": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
```

- [ ] **Step 5: Test — grupo de feature a medias advierte**

En `tests/env.test.ts`, agregar un test dentro de `describe("validateEnv", ...)`, después del test de R2:

```ts
  it("advierte si falta GOOGLE_CLIENT_SECRET habiendo GOOGLE_CLIENT_ID", () => {
    const { warnings } = validateEnv({ ...validBase, GOOGLE_CLIENT_ID: "abc" });
    expect(warnings.some((w) => w.includes("Google Calendar") && w.includes("GOOGLE_CLIENT_SECRET"))).toBe(true);
  });
```

- [ ] **Step 6: Correr los tests de env**

Run: `npx vitest run tests/env.test.ts`
Expected: todos los tests PASAN (incluido el nuevo).

- [ ] **Step 7: Agregar la dependencia**

Run: `npm install google-auth-library`
Expected: `package.json` y `package-lock.json` actualizados, sin errores.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0095_google_calendar.sql .env.example lib/env.ts tests/env.test.ts package.json package-lock.json
git commit -m "feat(google-calendar): fundaciones - migracion, env vars, dependencia"
```

---

### Task 2: Contenido del evento (funciones puras)

**Files:**
- Create: `lib/google-calendar/eventContent.ts`
- Test: `tests/google-calendar-eventContent.test.ts`

**Interfaces:**
- Produces: `buildEventTitle(patientName: string, reason: string | null | undefined, cancelled: boolean): string`, `buildEventDescription(phone: string | null | undefined): string`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/google-calendar-eventContent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildEventTitle, buildEventDescription } from "@/lib/google-calendar/eventContent";

describe("buildEventTitle", () => {
  it("nombre + motivo cuando hay motivo", () => {
    expect(buildEventTitle("Juan Pérez", "Control", false)).toBe("Juan Pérez — Control");
  });

  it("solo nombre cuando no hay motivo", () => {
    expect(buildEventTitle("Juan Pérez", null, false)).toBe("Juan Pérez");
    expect(buildEventTitle("Juan Pérez", "", false)).toBe("Juan Pérez");
    expect(buildEventTitle("Juan Pérez", undefined, false)).toBe("Juan Pérez");
  });

  it("antepone [Cancelado] cuando cancelled=true", () => {
    expect(buildEventTitle("Juan Pérez", "Control", true)).toBe("[Cancelado] Juan Pérez — Control");
    expect(buildEventTitle("Juan Pérez", null, true)).toBe("[Cancelado] Juan Pérez");
  });
});

describe("buildEventDescription", () => {
  it("incluye el teléfono si existe", () => {
    expect(buildEventDescription("70012345")).toBe("Tel: 70012345");
  });

  it("cadena vacía si no hay teléfono", () => {
    expect(buildEventDescription(null)).toBe("");
    expect(buildEventDescription(undefined)).toBe("");
    expect(buildEventDescription("")).toBe("");
  });
});
```

- [ ] **Step 2: Correr los tests, verificar que fallan**

Run: `npx vitest run tests/google-calendar-eventContent.test.ts`
Expected: FAIL — `Cannot find module '@/lib/google-calendar/eventContent'`

- [ ] **Step 3: Implementar**

Crear `lib/google-calendar/eventContent.ts`:

```ts
// Contenido del evento de Google Calendar que ve el doctor (fase 1: sync
// sistema -> Google, uno solo por cita, sin invitados).

export function buildEventTitle(
  patientName: string,
  reason: string | null | undefined,
  cancelled: boolean,
): string {
  const base = reason?.trim() ? `${patientName} — ${reason.trim()}` : patientName;
  return cancelled ? `[Cancelado] ${base}` : base;
}

export function buildEventDescription(phone: string | null | undefined): string {
  return phone?.trim() ? `Tel: ${phone.trim()}` : "";
}
```

- [ ] **Step 4: Correr los tests, verificar que pasan**

Run: `npx vitest run tests/google-calendar-eventContent.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/google-calendar/eventContent.ts tests/google-calendar-eventContent.test.ts
git commit -m "feat(google-calendar): funciones puras de contenido del evento"
```

---

### Task 3: Cliente OAuth + Calendar API

**Files:**
- Create: `lib/google-calendar/client.ts`
- Test: `tests/google-calendar-client.test.ts`

**Interfaces:**
- Consumes: `env.GOOGLE_CLIENT_ID`, `env.GOOGLE_CLIENT_SECRET`, `env.NEXT_PUBLIC_SITE_URL` (de `@/lib/env`, Task 1).
- Produces:
  - `getGoogleAuthUrl(state: string): string`
  - `interface GoogleTokens { accessToken: string; refreshToken: string; expiresAt: string }`
  - `exchangeCodeForTokens(code: string): Promise<GoogleTokens>`
  - `refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }>`
  - `isTokenExpired(expiresAt: string, now?: Date): boolean`
  - `interface CalendarEventInput { title: string; description: string; startsAt: string; endsAt: string }`
  - `createCalendarEvent(accessToken: string, event: CalendarEventInput): Promise<string>` (devuelve el `id` del evento creado)
  - `updateCalendarEvent(accessToken: string, eventId: string, event: CalendarEventInput): Promise<void>`
  - `deleteCalendarEvent(accessToken: string, eventId: string): Promise<void>`

- [ ] **Step 1: Escribir el test de `isTokenExpired` (única función pura de este archivo)**

Crear `tests/google-calendar-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isTokenExpired } from "@/lib/google-calendar/client";

describe("isTokenExpired", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("false si falta mucho para vencer", () => {
    expect(isTokenExpired("2026-07-21T13:00:00.000Z", now)).toBe(false);
  });

  it("true si ya venció", () => {
    expect(isTokenExpired("2026-07-21T11:00:00.000Z", now)).toBe(true);
  });

  it("true si vence dentro del margen de 2 minutos (evita usar un token que expira a mitad de la llamada)", () => {
    expect(isTokenExpired("2026-07-21T12:01:00.000Z", now)).toBe(true);
  });

  it("false justo fuera del margen de 2 minutos", () => {
    expect(isTokenExpired("2026-07-21T12:02:01.000Z", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test, verificar que falla**

Run: `npx vitest run tests/google-calendar-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/google-calendar/client'`

- [ ] **Step 3: Implementar `lib/google-calendar/client.ts`**

```ts
import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_EVENTS_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function redirectUri(): string {
  const site = env.NEXT_PUBLIC_SITE_URL ?? "https://clinica-dental-one-vert.vercel.app";
  return `${site}/api/google-calendar/callback`;
}

function oauthClient(): OAuth2Client {
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri());
}

// `state` es un token anti-CSRF (ver app/api/google-calendar/connect/route.ts),
// no lleva datos del usuario.
export function getGoogleAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline", // necesario para recibir refresh_token
    prompt: "consent",      // fuerza refresh_token también en reconexiones
    scope: [SCOPE],
    state,
  });
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google no devolvió access_token/refresh_token (revisa access_type=offline y prompt=consent).",
    );
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000).toISOString(),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error("Google no devolvió access_token al refrescar.");
  }
  return {
    accessToken: credentials.access_token,
    expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600_000).toISOString(),
  };
}

// Margen de 2 min antes del vencimiento real: evita usar un access_token que
// expira a mitad de la llamada a la Calendar API.
export function isTokenExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() - now.getTime() < 2 * 60_000;
}

export interface CalendarEventInput {
  title: string;
  description: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

function toGoogleEvent(event: CalendarEventInput) {
  return {
    summary: event.title,
    description: event.description || undefined,
    start: { dateTime: event.startsAt },
    end: { dateTime: event.endsAt },
  };
}

export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEventInput,
): Promise<string> {
  const res = await fetch(CALENDAR_EVENTS_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(event)),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar create falló: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<void> {
  const res = await fetch(`${CALENDAR_EVENTS_API}/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(event)),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar update falló: ${res.status} ${await res.text()}`);
  }
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`${CALENDAR_EVENTS_API}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 = el doctor ya lo había borrado a mano; no es un error real.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete falló: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 4: Correr el test, verificar que pasa**

Run: `npx vitest run tests/google-calendar-client.test.ts`
Expected: PASS (4 tests)

Nota: `getGoogleAuthUrl`, `exchangeCodeForTokens`, `refreshAccessToken`, `createCalendarEvent`,
`updateCalendarEvent`, `deleteCalendarEvent` hacen red real (Google OAuth / Calendar API). Siguiendo
la convención de este proyecto (ningún test existente mockea `fetch` ni clientes externos), se
verifican manualmente en la Tarea 9, no con mocks aquí.

- [ ] **Step 5: Commit**

```bash
git add lib/google-calendar/client.ts tests/google-calendar-client.test.ts
git commit -m "feat(google-calendar): cliente OAuth + Calendar API REST"
```

---

### Task 4: Almacenamiento de tokens

**Files:**
- Create: `lib/google-calendar/tokens.ts`

**Interfaces:**
- Consumes: `createAdminClient()` de `@/lib/supabase/admin`; `refreshAccessToken`, `isTokenExpired`, `GoogleTokens` de `@/lib/google-calendar/client` (Task 3).
- Produces:
  - `saveTokens(profileId: string, clinicId: string, tokens: GoogleTokens): Promise<void>`
  - `clearTokens(profileId: string): Promise<void>`
  - `ensureFreshAccessToken(profileId: string): Promise<string | null>`

Sin test automatizado en esta tarea: toca Supabase real (mismo criterio que el resto de
`app/(dashboard)/agenda/actions.ts`, que tampoco tiene tests unitarios — se verifica manualmente
en la Tarea 9). No hay Step de test aquí porque no hay lógica pura que aislar; es un wrapper
delgado sobre el cliente admin.

- [ ] **Step 1: Implementar `lib/google-calendar/tokens.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, isTokenExpired, type GoogleTokens } from "@/lib/google-calendar/client";

export async function saveTokens(
  profileId: string,
  clinicId: string,
  tokens: GoogleTokens,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("google_calendar_tokens").upsert({
    profile_id: profileId,
    clinic_id: clinicId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
  });
  await admin.from("profiles").update({ google_calendar_connected: true }).eq("id", profileId);
}

export async function clearTokens(profileId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("google_calendar_tokens").delete().eq("profile_id", profileId);
  await admin.from("profiles").update({ google_calendar_connected: false }).eq("id", profileId);
}

// Devuelve un access_token vigente para el doctor, refrescándolo si venció.
// Devuelve null si el doctor no está conectado, o si Google rechazó el
// refresh (revocado desde su cuenta de Google) — en ese caso desconecta
// automáticamente para que Ajustes vuelva a mostrar el botón "Conectar".
export async function ensureFreshAccessToken(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("google_calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!row) return null;

  if (!isTokenExpired(row.expires_at)) return row.access_token;

  try {
    const refreshed = await refreshAccessToken(row.refresh_token);
    await admin
      .from("google_calendar_tokens")
      .update({ access_token: refreshed.accessToken, expires_at: refreshed.expiresAt })
      .eq("profile_id", profileId);
    return refreshed.accessToken;
  } catch (err) {
    console.error("google-calendar: refresh token inválido, desconectando doctor", profileId, err);
    await clearTokens(profileId);
    return null;
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `lib/google-calendar/tokens.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/google-calendar/tokens.ts
git commit -m "feat(google-calendar): almacenamiento y refresh de tokens"
```

---

### Task 5: Orquestador de sync

**Files:**
- Create: `lib/google-calendar/sync.ts`

**Interfaces:**
- Consumes: `ensureFreshAccessToken` de `@/lib/google-calendar/tokens` (Task 4); `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent` de `@/lib/google-calendar/client` (Task 3); `buildEventTitle`, `buildEventDescription` de `@/lib/google-calendar/eventContent` (Task 2); `createAdminClient` de `@/lib/supabase/admin`.
- Produces:
  - `type SyncAction = "create" | "update" | "cancel" | "delete"`
  - `syncAppointmentToGoogle(appointmentId: string, action: SyncAction): Promise<void>` — NUNCA lanza.
  - `backfillDoctorAppointments(dentistId: string): Promise<void>`

Sin test automatizado (toca Supabase + Google real), mismo criterio que Task 4. Se verifica en la Tarea 9.

- [ ] **Step 1: Implementar `lib/google-calendar/sync.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureFreshAccessToken } from "@/lib/google-calendar/tokens";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar/client";
import { buildEventTitle, buildEventDescription } from "@/lib/google-calendar/eventContent";

export type SyncAction = "create" | "update" | "cancel" | "delete";

// Nunca propaga errores: un fallo de Google no debe romper la acción de la
// recepcionista. No hay cola de trabajos en este proyecto, así que esto se
// awaitea inline en cada acción de agenda/actions.ts — pero como nunca lanza,
// el caller no ve ni error ni rollback, solo la latencia real de 1-2 llamadas
// HTTP a Google (o ninguna, si el doctor no está conectado).
export async function syncAppointmentToGoogle(
  appointmentId: string,
  action: SyncAction,
): Promise<void> {
  try {
    await run(appointmentId, action);
  } catch (err) {
    console.error(`google-calendar sync (${action}) falló para cita ${appointmentId}:`, err);
  }
}

async function run(appointmentId: string, action: SyncAction): Promise<void> {
  const admin = createAdminClient();
  const { data: appt } = await admin
    .from("appointments")
    .select(
      "id, dentist_id, patient_id, patient_name, reason, starts_at, ends_at, status, google_event_id, patients(full_name, phone)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt || !appt.dentist_id) return; // sin doctor asignado, nada que sincronizar

  const accessToken = await ensureFreshAccessToken(appt.dentist_id);
  if (!accessToken) return; // doctor no conectado (o se acaba de desconectar)

  if (action === "delete") {
    if (appt.google_event_id) await deleteCalendarEvent(accessToken, appt.google_event_id);
    return;
  }

  // create/update/cancel comparten el mismo upsert: si ya existe google_event_id
  // se hace PATCH, si no se crea. "cancel" es solo un update donde el status ya
  // es 'cancelled' -> el título sale con el prefijo [Cancelado].
  const patient = appt.patients as { full_name?: string; phone?: string | null } | null;
  const patientName = patient?.full_name ?? appt.patient_name ?? "Paciente";
  const event = {
    title: buildEventTitle(patientName, appt.reason, appt.status === "cancelled"),
    description: buildEventDescription(patient?.phone ?? null),
    startsAt: appt.starts_at,
    endsAt: appt.ends_at,
  };

  if (appt.google_event_id) {
    await updateCalendarEvent(accessToken, appt.google_event_id, event);
    return;
  }

  const eventId = await createCalendarEvent(accessToken, event);
  await admin.from("appointments").update({ google_event_id: eventId }).eq("id", appointmentId);
}

// Backfill: crea eventos para las citas futuras activas de un doctor recién
// conectado. Se llama una sola vez, desde el callback de OAuth.
export async function backfillDoctorAppointments(dentistId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: appts } = await admin
    .from("appointments")
    .select("id")
    .eq("dentist_id", dentistId)
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", new Date().toISOString());

  for (const a of appts ?? []) {
    await syncAppointmentToGoogle(a.id, "create");
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `lib/google-calendar/sync.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/google-calendar/sync.ts
git commit -m "feat(google-calendar): orquestador de sync y backfill"
```

---

### Task 6: Rutas OAuth connect/callback

**Files:**
- Create: `app/api/google-calendar/connect/route.ts`
- Create: `app/api/google-calendar/callback/route.ts`

**Interfaces:**
- Consumes: `getProfile` de `@/lib/auth`; `can` de `@/lib/rbac`; `getGoogleAuthUrl`, `exchangeCodeForTokens` de `@/lib/google-calendar/client` (Task 3); `saveTokens` de `@/lib/google-calendar/tokens` (Task 4); `backfillDoctorAppointments` de `@/lib/google-calendar/sync` (Task 5).
- Produces: `GET /api/google-calendar/connect`, `GET /api/google-calendar/callback` — usados por `GoogleCalendarPanel` (Task 7).

- [ ] **Step 1: Implementar `app/api/google-calendar/connect/route.ts`**

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getGoogleAuthUrl } from "@/lib/google-calendar/client";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function GET() {
  const profile = await getProfile();
  if (!profile || !can(profile.role, "clinical:write")) {
    return NextResponse.redirect(new URL("/ajustes", SITE_URL));
  }

  // Token anti-CSRF: se guarda en cookie httpOnly y se compara en el callback.
  const state = randomUUID();
  const jar = await cookies();
  jar.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 min, de sobra para completar el consent de Google
    path: "/",
  });

  return NextResponse.redirect(getGoogleAuthUrl(state));
}
```

- [ ] **Step 2: Implementar `app/api/google-calendar/callback/route.ts`**

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/google-calendar/client";
import { saveTokens } from "@/lib/google-calendar/tokens";
import { backfillDoctorAppointments } from "@/lib/google-calendar/sync";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function ajustesUrl(status: "ok" | "error"): URL {
  const url = new URL("/ajustes", SITE_URL);
  url.searchParams.set("gcal", status);
  return url;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(ajustesUrl("error"));

  const jar = await cookies();
  const expectedState = jar.get("gcal_oauth_state")?.value;
  jar.delete("gcal_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(ajustesUrl("error"));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveTokens(profile.userId, profile.clinicId, tokens);
    await backfillDoctorAppointments(profile.userId);
  } catch (err) {
    console.error("google-calendar callback falló:", err);
    return NextResponse.redirect(ajustesUrl("error"));
  }

  return NextResponse.redirect(ajustesUrl("ok"));
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/api/google-calendar/`

- [ ] **Step 4: Commit**

```bash
git add app/api/google-calendar/connect/route.ts app/api/google-calendar/callback/route.ts
git commit -m "feat(google-calendar): rutas OAuth connect/callback"
```

---

### Task 7: Panel en Ajustes (conectar/desconectar)

**Files:**
- Create: `app/(dashboard)/ajustes/google-calendar-actions.ts`
- Create: `components/ajustes/GoogleCalendarPanel.tsx`
- Modify: `app/(dashboard)/ajustes/page.tsx`

**Interfaces:**
- Consumes: `getProfile` de `@/lib/auth`; `can` de `@/lib/rbac`; `clearTokens` de `@/lib/google-calendar/tokens` (Task 4); `toast` de `@/lib/toast`.
- Produces: `disconnectGoogleCalendar(): Promise<{ ok?: boolean; error?: string }>`; componente `<GoogleCalendarPanel connected={boolean} />`.

- [ ] **Step 1: Implementar el server action `app/(dashboard)/ajustes/google-calendar-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { clearTokens } from "@/lib/google-calendar/tokens";

export type GoogleCalendarState = { ok?: boolean; error?: string };

export async function disconnectGoogleCalendar(): Promise<GoogleCalendarState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso." };

  await clearTokens(profile.userId);
  revalidatePath("/ajustes");
  return { ok: true };
}
```

- [ ] **Step 2: Implementar `components/ajustes/GoogleCalendarPanel.tsx`**

```tsx
"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Link as LinkIcon, Unlink } from "lucide-react";
import { disconnectGoogleCalendar } from "@/app/(dashboard)/ajustes/google-calendar-actions";
import { toast } from "@/lib/toast";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Vinculación de Google Calendar del doctor: sus citas agendadas en el
// sistema se replican automáticamente en su calendario personal (primary).
export function GoogleCalendarPanel({ connected }: { connected: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const gcalStatus = params.get("gcal");

  useEffect(() => {
    if (gcalStatus === "ok") toast("Google Calendar conectado", "success");
    if (gcalStatus === "error") toast("No se pudo conectar Google Calendar", "error");
    if (gcalStatus) router.replace("/ajustes");
  }, [gcalStatus, router]);

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectGoogleCalendar();
      if (res.ok) {
        toast("Google Calendar desconectado", "success");
        router.refresh();
      } else {
        toast(res.error ?? "No se pudo desconectar", "error");
      }
    });
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="max-w-sm">
        {connected ? (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <CalendarCheck className="h-4 w-4" /> Conectado
            </span>
            <button type="button" className={btn} disabled={pending} onClick={disconnect}>
              <Unlink className="h-3.5 w-3.5" /> Desconectar
            </button>
          </div>
        ) : (
          <a href="/api/google-calendar/connect" className={btn}>
            <LinkIcon className="h-3.5 w-3.5" /> Conectar Google Calendar
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wirear el panel en `app/(dashboard)/ajustes/page.tsx`**

Agregar el import, junto a los demás imports de componentes de Ajustes (después de la línea
`import { MySignaturePanel } from "@/components/ajustes/MySignaturePanel";`):

```ts
import { GoogleCalendarPanel } from "@/components/ajustes/GoogleCalendarPanel";
```

Modificar el bloque que ya carga `mySignature` (usa el mismo `canSignPrescriptions` y el mismo
`profile`, así que se extiende el `select` existente en vez de duplicar el query):

```ts
  // Firma personal del doctor (recetas médicas) + estado de Google Calendar.
  let mySignature: string | null = null;
  let googleCalendarConnected = false;
  if (canSignPrescriptions && profile) {
    const { data } = await supabase
      .from("profiles")
      .select("signature, google_calendar_connected")
      .eq("id", profile.userId)
      .single();
    mySignature = (data?.signature as string | null) ?? null;
    googleCalendarConnected = data?.google_calendar_connected ?? false;
  }
```

Esto reemplaza el bloque actual (líneas 37-44 antes de este cambio):
```ts
  let mySignature: string | null = null;
  if (canSignPrescriptions && profile) {
    const { data } = await supabase
      .from("profiles")
      .select("signature")
      .eq("id", profile.userId)
      .single();
    mySignature = (data?.signature as string | null) ?? null;
  }
```

Y en el JSX, después de la sección `{canSignPrescriptions && ( <section> ... Mi firma ... </section> )}`,
agregar una nueva sección con el mismo gate:

```tsx
      {canSignPrescriptions && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800">Google Calendar</h2>
          <p className="mb-3 text-sm text-slate-500">
            Tus citas agendadas en el sistema se replican en tu calendario personal.
          </p>
          <GoogleCalendarPanel connected={googleCalendarConnected} />
        </section>
      )}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a Ajustes

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/ajustes/google-calendar-actions.ts" components/ajustes/GoogleCalendarPanel.tsx "app/(dashboard)/ajustes/page.tsx"
git commit -m "feat(google-calendar): panel conectar/desconectar en Ajustes"
```

---

### Task 8: Hooks de sync en las acciones de agenda

**Files:**
- Modify: `app/(dashboard)/agenda/actions.ts`

**Interfaces:**
- Consumes: `syncAppointmentToGoogle` de `@/lib/google-calendar/sync` (Task 5).

- [ ] **Step 1: Importar `syncAppointmentToGoogle`**

En `app/(dashboard)/agenda/actions.ts`, agregar el import después de:
```ts
import { freeSlotsForDay, formatFreeSlotsMessage } from "@/lib/freeSlots";
```
agregar:
```ts
import { syncAppointmentToGoogle } from "@/lib/google-calendar/sync";
```

- [ ] **Step 2: Hook en `createAppointment`**

Reemplazar (dentro de `createAppointment`, al final de la función):
```ts
  revalidatePath("/agenda");
  return { ok: true };
}

// Edita una cita existente. Reusa el mismo esquema/validación que la creación.
// Conserva el estado actual (no lo toca) y vuelve a chequear choques de horario,
// excluyendo la propia cita.
export async function updateAppointment(
```
por:
```ts
  await syncAppointmentToGoogle(appt.id, "create");

  revalidatePath("/agenda");
  return { ok: true };
}

// Edita una cita existente. Reusa el mismo esquema/validación que la creación.
// Conserva el estado actual (no lo toca) y vuelve a chequear choques de horario,
// excluyendo la propia cita.
export async function updateAppointment(
```

- [ ] **Step 3: Hook en `updateAppointment`**

Reemplazar (dentro de `updateAppointment`, al final de la función):
```ts
  revalidatePath("/agenda");
  return { ok: true };
}

// Cancela una cita (status -> 'cancelled'). Conserva el registro para historial;
// la agenda ya filtra los cancelados, así que desaparece de la vista.
export async function cancelAppointment(id: string): Promise<ActionState> {
```
por:
```ts
  await syncAppointmentToGoogle(appointmentId, "update");

  revalidatePath("/agenda");
  return { ok: true };
}

// Cancela una cita (status -> 'cancelled'). Conserva el registro para historial;
// la agenda ya filtra los cancelados, así que desaparece de la vista.
export async function cancelAppointment(id: string): Promise<ActionState> {
```

- [ ] **Step 4: Hook en `cancelAppointment`**

Reemplazar (dentro de `cancelAppointment`, cuerpo completo de la función):
```ts
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

const STATUSES = [
```
por:
```ts
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  await cancelPendingReminders(supabase, id);
  await syncAppointmentToGoogle(id, "cancel");

  revalidatePath("/agenda");
  return { ok: true };
}

const STATUSES = [
```

- [ ] **Step 5: Hook en `setAppointmentStatus` (solo cuando pasa a `cancelled`)**

Reemplazar (dentro de `setAppointmentStatus`, al final de la función):
```ts
  // Al marcar la cita como atendida, los datos financieros migran al historial.
  if (status === "finished") {
    await migrateAppointmentFinance(id, profile);
  }

  revalidatePath("/agenda");
  return { ok: true };
}

// Reprograma una cita (drag & drop en la agenda). Solo mueve fecha/hora; no
```
por:
```ts
  // Al marcar la cita como atendida, los datos financieros migran al historial.
  if (status === "finished") {
    await migrateAppointmentFinance(id, profile);
  }
  if (status === "cancelled") {
    await syncAppointmentToGoogle(id, "cancel");
  }

  revalidatePath("/agenda");
  return { ok: true };
}

// Reprograma una cita (drag & drop en la agenda). Solo mueve fecha/hora; no
```

- [ ] **Step 6: Hook en `rescheduleAppointment`**

Reemplazar (dentro de `rescheduleAppointment`, al final de la función):
```ts
  if (patientId && normalizeFeatures(clinicData?.features).recordatorios) {
    await cancelPendingReminders(supabase, id);
    const settings = (clinicData?.settings ?? {}) as Record<string, unknown>;
    const rows = buildReminderRows(profile.clinicId, id, new Date(startsUTC), settings);
    if (rows.length > 0) {
      await supabase.from("appointment_reminders").insert(rows);
    }
  }

  revalidatePath("/agenda");
  return { ok: true };
}

// Elimina una cita. Los recordatorios asociados caen por FK on delete cascade.
export async function deleteAppointment(id: string): Promise<ActionState> {
```
por:
```ts
  if (patientId && normalizeFeatures(clinicData?.features).recordatorios) {
    await cancelPendingReminders(supabase, id);
    const settings = (clinicData?.settings ?? {}) as Record<string, unknown>;
    const rows = buildReminderRows(profile.clinicId, id, new Date(startsUTC), settings);
    if (rows.length > 0) {
      await supabase.from("appointment_reminders").insert(rows);
    }
  }

  await syncAppointmentToGoogle(id, "update");

  revalidatePath("/agenda");
  return { ok: true };
}

// Elimina una cita. Los recordatorios asociados caen por FK on delete cascade.
export async function deleteAppointment(id: string): Promise<ActionState> {
```

- [ ] **Step 7: Hook en `deleteAppointment`**

Reemplazar (dentro de `deleteAppointment`, cuerpo completo de la función):
```ts
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { ok: true };
}

// Vincula una cita de consulta rápida a un paciente ya registrado.
```
por:
```ts
  const supabase = await createClient();
  await syncAppointmentToGoogle(id, "delete"); // antes del delete: la lee por id

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { ok: true };
}

// Vincula una cita de consulta rápida a un paciente ya registrado.
```

**Nota:** en `deleteAppointment`, el sync se llama ANTES del `delete` de Postgres — `syncAppointmentToGoogle`
necesita leer la fila (`dentist_id`, `google_event_id`) para saber qué evento borrar en Google; si se
llamara después, la fila ya no existiría y el sync sería un no-op silencioso.

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `agenda/actions.ts`

- [ ] **Step 9: Correr toda la suite de tests**

Run: `npx vitest run`
Expected: todos los tests existentes siguen en PASS (no se tocó lógica de negocio, solo se agregaron llamadas de sync).

- [ ] **Step 10: Commit**

```bash
git add "app/(dashboard)/agenda/actions.ts"
git commit -m "feat(google-calendar): hooks de sync en crear/editar/cancelar/reagendar/borrar cita"
```

---

### Task 9: Verificación manual end-to-end

**Files:** ninguno (solo verificación).

Antes de empezar, crear un OAuth client real en Google Cloud Console:
1. Proyecto nuevo → habilitar "Google Calendar API".
2. Pantalla de consentimiento OAuth (External, modo Testing alcanza para probar) con el propio
   Gmail del doctor de prueba agregado como "Test user".
3. Credenciales → OAuth client ID → Web application → Authorized redirect URI:
   `http://localhost:3000/api/google-calendar/callback` (dev) y la URL de producción cuando se
   despliegue.
4. Copiar `client_id`/`client_secret` a `.env.local` como `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

- [ ] **Step 1: Levantar el entorno**

Run: `npm run dev`
Expected: arranca sin errores en `http://localhost:3000`

- [ ] **Step 2: Conectar**

Login como un doctor de prueba (rol `odontologo_general`/`especialista`/`colega`/`admin`) que ya
tenga al menos una cita futura con `status='scheduled'`. Ir a Ajustes → sección "Google Calendar" →
"Conectar Google Calendar". Completar el consent de Google con la cuenta de prueba.
Expected: redirige a `/ajustes?gcal=ok`, toast "Google Calendar conectado", el panel muestra "Conectado".

- [ ] **Step 3: Verificar backfill**

Abrir Google Calendar de la cuenta de prueba.
Expected: la(s) cita(s) futura(s) ya existente(s) aparecen como eventos, con título
`{paciente} — {motivo}` (o solo `{paciente}` si no hay motivo) y horario correcto.

- [ ] **Step 4: Crear una cita nueva**

Desde la Agenda del sistema, crear una cita nueva para ese doctor.
Expected: en pocos segundos aparece el evento nuevo en su Google Calendar.

- [ ] **Step 5: Reagendar (drag & drop)**

Arrastrar la cita a otro horario en la grilla de la Agenda.
Expected: el evento en Google Calendar se mueve al nuevo horario (mismo evento, no uno duplicado).

- [ ] **Step 6: Cancelar**

Cancelar la cita desde la Agenda.
Expected: el evento en Google Calendar sigue existiendo pero el título ahora empieza con
`[Cancelado]`.

- [ ] **Step 7: Desconectar**

Ir a Ajustes → "Desconectar".
Expected: el panel vuelve a mostrar "Conectar Google Calendar"; los eventos ya creados en Google
Calendar del doctor SIGUEN ahí (no se borran).

- [ ] **Step 8: Confirmar que una cita nueva ya no sincroniza tras desconectar**

Crear otra cita para el mismo doctor.
Expected: NO aparece nada nuevo en su Google Calendar (doctor desconectado, sync es no-op).

- [ ] **Step 9: Reportar resultado**

Si todos los pasos anteriores pasan, la feature está lista para PR/merge. Si algo falla, anotar en
qué paso y el mensaje de `console.error` (Vercel logs en prod, terminal de `npm run dev` en local)
antes de continuar.
