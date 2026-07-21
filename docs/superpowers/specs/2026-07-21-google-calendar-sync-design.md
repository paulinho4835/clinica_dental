# Sync Google Calendar (fase 1: doctores)

## Contexto

El sistema es la única fuente de verdad para agendar citas — las recepcionistas
agendan, reagendan y cancelan desde la agenda del sistema, no los doctores.
Los doctores quieren ver sus citas también en su Google Calendar (celular,
notificaciones nativas) sin cambiar el flujo de trabajo de nadie.

Dirección del sync: **sistema → Google Calendar** (one-way push). No hay sync
inverso: un evento creado a mano en el Google Calendar del doctor no aparece
en el sistema. Fase 2 (fuera de scope) evaluará si las recepcionistas
necesitan algo distinto.

## Alcance

- Cada doctor conecta su propia cuenta de Google (OAuth) desde Ajustes.
- Se sincroniza únicamente el calendario `primary` de esa cuenta.
- Al conectar, se hace backfill de las citas futuras (`scheduled`/`confirmed`)
  de ese doctor.
- De ahí en más, cada creación/reagenda/cancelación de una cita del doctor en
  el sistema actualiza su Google Calendar automáticamente.
- Fuera de scope: sync desde recepcionistas (no aplica, ellas no tienen
  calendario propio en este flujo), sync bidireccional, multi-calendario.

## Arquitectura

- **Google Cloud**: proyecto nuevo, Calendar API habilitada, OAuth client
  (tipo Web application), redirect URI `/api/google-calendar/callback`.
- **Librería**: `google-auth-library` (solo para `OAuth2Client` y refresh de
  tokens) + `fetch` directo contra Calendar API v3 REST. Se evita el paquete
  `googleapis` completo (pesado, no se necesita su cobertura completa de APIs).
- **Endpoints**:
  - `GET /api/google-calendar/connect` — redirige a la pantalla de consentimiento
    de Google (`scope=https://www.googleapis.com/auth/calendar.events`,
    `access_type=offline`, `prompt=consent` para asegurar refresh_token).
  - `GET /api/google-calendar/callback` — recibe el `code`, lo intercambia por
    tokens, los guarda, dispara el backfill inicial.
- **UI**: `components/ajustes/GoogleCalendarPanel.tsx` en Ajustes (mismo lugar
  que "Mi firma"), visible para roles con `clinical:write`. Muestra estado
  (conectado/no conectado) y botón Conectar / Desconectar.

## Data model

Migración `supabase/migrations/0095_google_calendar.sql`:

```sql
alter table profiles add column if not exists google_calendar_connected boolean not null default false;

create table google_calendar_tokens (
  profile_id    uuid primary key references profiles(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  connected_at  timestamptz not null default now()
);

alter table appointments add column if not exists google_event_id text;
```

`google_calendar_tokens` va separada de `profiles` por ser dato sensible y
rotativo (el `access_token` se reemplaza en cada refresh); `google_calendar_connected`
en `profiles` es solo un flag de lectura rápida para la UI, evita un join en
cada render de Ajustes/agenda.

## Flujo de conexión y backfill

1. Doctor hace click en "Conectar Google Calendar" → `/api/google-calendar/connect`.
2. Google redirige a `/api/google-calendar/callback?code=...`.
3. Se intercambia `code` por `{access_token, refresh_token, expires_at}`,
   se guarda en `google_calendar_tokens`, se pone `profiles.google_calendar_connected = true`.
4. Backfill: se buscan citas de ese doctor con `starts_at >= now()` y
   `status in ('scheduled','confirmed')`, se crea un evento de Google por
   cada una (ver formato abajo), se guarda `google_event_id` de vuelta en
   cada fila de `appointments`.
5. Redirect a `/ajustes` con mensaje de éxito.

## Formato del evento

- **Título**: `{nombre del paciente} — {motivo}` (si no hay motivo, solo el nombre).
- **Descripción**: teléfono del paciente + notas de la cita, si existen.
- **Horario**: `starts_at` / `ends_at` de la cita, tal cual.

## Sync en cada acción sobre una cita

`lib/google-calendar/sync.ts` expone:

```ts
syncAppointmentToGoogle(appointmentId: string, action: "create" | "update" | "cancel" | "delete"): Promise<void>
```

Se llama, **fire-and-forget** (no se espera ni se propaga su error), desde:

- `createAppointment` → `"create"`
- `updateAppointment`, `rescheduleAppointment` → `"update"`
- `cancelAppointment`, `setAppointmentStatus` (cuando el nuevo status es `cancelled`) → `"cancel"`
- `deleteAppointment` → `"delete"`

Comportamiento de cada acción:

- **create**: si el doctor no tiene `google_calendar_connected`, no-op. Si sí,
  crea el evento vía `POST /calendar/v3/calendars/primary/events`, guarda
  `google_event_id` en la fila de `appointments`.
- **update**: si la cita no tiene `google_event_id` (doctor se conectó después,
  o el create falló silenciosamente), se comporta como `create`. Si lo tiene,
  `PATCH` del evento existente.
- **cancel**: `PATCH` del evento, cambia el título a `[Cancelado] {título original}`.
  No se borra el evento (así lo decidió el usuario — el doctor lo ve tachado/gris
  en su calendar en vez de que desaparezca sin explicación).
- **delete** (borrado duro de la cita, no cancelación): `DELETE` del evento.

Todas las llamadas HTTP van envueltas en `try/catch` con `console.error` — un
fallo de Google **nunca** debe hacer fallar la acción de la recepcionista.

## Refresh de tokens y desconexión de Google

- Antes de cada llamada a la Calendar API, se verifica `expires_at`; si venció,
  se refresca con `refresh_token` (`google-auth-library`) y se actualiza
  `access_token`/`expires_at` en `google_calendar_tokens`.
- Si el refresh falla con `invalid_grant` (el doctor revocó el acceso desde su
  cuenta de Google, o el refresh_token expiró), se marca
  `profiles.google_calendar_connected = false` y se borra la fila de
  `google_calendar_tokens`. El sync deja de intentarse hasta que el doctor
  vuelva a conectar manualmente. No hay reintentos automáticos ni alertas —
  la próxima vez que entre a Ajustes verá el botón en estado "Conectar" de nuevo.

## Desconexión manual

Botón "Desconectar" en el panel → borra la fila de `google_calendar_tokens`,
pone `profiles.google_calendar_connected = false`. Los eventos ya creados en
el Google Calendar del doctor **se dejan como están** — no se llama a la API
de Google para borrarlos. Si el doctor quiere limpiarlos, lo hace manualmente
desde su calendario.

## Testing

- Unit: `syncAppointmentToGoogle` con el cliente HTTP de Google mockeado —
  casos create/update/cancel/delete, doctor no conectado (no-op), token
  expirado (refresca), `invalid_grant` (auto-desconecta).
- Manual end-to-end: conectar cuenta de prueba → verificar backfill → crear
  cita → verificar evento en Google Calendar → reagendar → cancelar → ver
  título `[Cancelado] ...` → desconectar → verificar que el evento sigue ahí.

## Fuera de scope (fase 2, a futuro)

- Sync para recepcionistas / cuenta compartida de la clínica.
- Sync inverso (Google → sistema).
- Multi-calendario, invitados, recordatorios custom de Google.
