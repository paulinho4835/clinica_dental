-- Addon "disponibilidad": bloques donde un doctor NO atiende.
-- Dos formas, mismo registro: semanal recurrente (weekday 0=lunes…6=domingo)
-- o por fechas (date_from..date_to inclusive). El horario general de la
-- clínica (08-20) no cambia; esto registra excepciones.
create table doctor_availability (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  dentist_id uuid not null references profiles(id) on delete cascade,
  weekday smallint check (weekday between 0 and 6),
  date_from date,
  date_to date,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Exactamente una de las dos formas.
  constraint da_weekly_xor_dated check ((weekday is not null) <> (date_from is not null)),
  -- Rango de fechas completo y coherente.
  constraint da_date_range check (date_from is null or (date_to is not null and date_to >= date_from)),
  constraint da_time_range check (end_time > start_time)
);

create index doctor_availability_clinic_dentist
  on doctor_availability (clinic_id, dentist_id);

alter table doctor_availability enable row level security;

-- Lectura: toda la clínica (doctores ven sus bloques grises en la agenda).
create policy doctor_availability_select on doctor_availability for select
  using (clinic_id = (select auth_clinic_id()));

-- Escritura: admin Y recepcionista (el doctor avisa, la recepción registra).
create policy doctor_availability_write on doctor_availability for all
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  );
