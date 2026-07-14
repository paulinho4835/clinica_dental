-- 0088_audit_archive_runs.sql — Registro de archivado automático de auditoría
-- clínica (odontogram_events, odontogram_pediatric_events,
-- patient_evolution_note_history). El cron /api/cron/audit-archive exporta a
-- R2 las filas más viejas que el corte de retención (2 años), VERIFICA la
-- subida y solo entonces borra de Postgres — mismo patrón que backup_runs
-- (0068): "un archivado que nunca se verificó no es un archivado".

create table if not exists audit_archive_runs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references clinics(id) on delete cascade,
  table_name  text not null,        -- tabla origen archivada
  status      text not null,        -- 'ok' | 'error'
  storage_key text,                 -- objeto en R2: archives/{clinic_id}/{tabla}/{fecha}.json
  row_count   int,
  cutoff_at   timestamptz,          -- corte usado (filas anteriores a esto se archivaron)
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_archive_runs_clinic_idx
  on audit_archive_runs (clinic_id, created_at desc);

-- Solo el panel de superadmin (service_role, que bypassa RLS) lee/escribe esto.
-- RLS activa SIN policies = denegado para anon/authenticated.
alter table audit_archive_runs enable row level security;
