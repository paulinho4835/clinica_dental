-- Telemetría agregada del dictado por voz. No contiene audio, transcript ni prompt.
create table if not exists odontogram_voice_usage (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  transcript_char_count integer not null check (transcript_char_count >= 0),
  proposed_count smallint not null check (proposed_count >= 0),
  applied_count smallint not null check (applied_count >= 0),
  uncertainty_count smallint not null check (uncertainty_count >= 0),
  outcome text not null check (outcome in ('applied', 'cancelled', 'error')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0)
);

create index if not exists idx_odontogram_voice_usage_retention
  on odontogram_voice_usage (created_at);

alter table odontogram_voice_usage enable row level security;
create policy tenant_isolation on odontogram_voice_usage
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- El cron de la aplicación ejecuta esta limpieza semanalmente.
create or replace function cleanup_odontogram_voice_usage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from odontogram_voice_usage where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
