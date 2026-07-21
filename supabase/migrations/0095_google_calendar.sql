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
