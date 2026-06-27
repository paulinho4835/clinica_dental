-- Registro de respaldos automáticos por clínica. El cron /api/cron/backup genera
-- el snapshot (función backup_clinic de 0050), lo sube a Cloudflare R2 bajo
-- backups/{clinic_id}/{fecha}.json, VERIFICA su integridad (estructura + conteos)
-- y deja una fila aquí. El panel de superadmin muestra el último respaldo y si
-- falló. "Un backup que nunca se verificó no es un backup."

create table if not exists backup_runs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references clinics(id) on delete cascade,
  status      text not null,        -- 'ok' | 'error'
  storage_key text,                 -- objeto en R2: backups/{clinic_id}/{fecha}.json
  size_bytes  bigint,
  table_count int,                  -- nº de tablas respaldadas (verificación)
  row_count   int,                  -- nº total de filas (verificación)
  error       text,                 -- mensaje si status = 'error'
  created_at  timestamptz not null default now()
);

create index if not exists backup_runs_clinic_idx
  on backup_runs (clinic_id, created_at desc);

-- Solo el panel de superadmin (service_role, que bypassa RLS) lee/escribe esto.
-- RLS activa SIN policies = denegado para anon/authenticated (nunca expuesto a clínicas).
alter table backup_runs enable row level security;
