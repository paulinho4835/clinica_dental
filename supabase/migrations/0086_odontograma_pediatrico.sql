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
