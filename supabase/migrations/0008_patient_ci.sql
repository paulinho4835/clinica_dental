-- ============================================================================
-- 0008_patient_ci.sql — Cédula de identidad (CI) del paciente + búsqueda
--   national_id: documento de identidad. Único por clínica (no global: dos
--   clínicas pueden atender a la misma persona de forma independiente).
-- ============================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;

alter table patients
  add column if not exists national_id text;

-- Único por clínica, ignorando nulos (pacientes sin CI cargado aún).
create unique index if not exists uq_patients_clinic_ci
  on patients (clinic_id, national_id)
  where national_id is not null;

-- Texto de búsqueda normalizado (sin acentos, minúsculas): nombre + CI.
-- Así "maria" encuentra "María" y la búsqueda es predecible.
-- unaccent no es IMMUTABLE por defecto -> envoltura inmutable para poder
-- usarla en una columna generada.
create or replace function public.immutable_unaccent(text)
returns text language sql immutable parallel safe as $$
  select public.unaccent('public.unaccent', $1)
$$;

alter table patients
  add column if not exists search_text text
  generated always as (
    lower(public.immutable_unaccent(coalesce(full_name, '') || ' ' || coalesce(national_id, '')))
  ) stored;

create index if not exists idx_patients_search
  on patients using gin (search_text gin_trgm_ops);
