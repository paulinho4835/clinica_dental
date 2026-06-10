-- ============================================================================
-- 0022_doctor_works.sql
-- (1) Módulo del doctor: registra trabajos realizados + comisión + cobro.
--     La comisión se calcula sola (costo × %), el % se teclea por trabajo.
-- (2) Visibilidad de pacientes: cada odontólogo ve SOLO los pacientes con los
--     que tiene cita o trabajo registrado. Admin y recepción ven a todos.
-- ============================================================================

-- ── Trabajos del doctor ─────────────────────────────────────────────────────
create table doctor_works (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  doctor_id         uuid not null references profiles(id) on delete cascade,
  patient_id        uuid references patients(id) on delete set null,
  patient_name      text,                              -- si el paciente no está registrado
  description       text not null,                     -- trabajo realizado (ej. "Cirugía")
  cost              numeric(12,2) not null default 0,  -- costo del trabajo
  commission_pct    numeric(5,2)  not null default 0,  -- % de comisión (manual)
  -- Comisión = costo × % (se calcula sola y no se puede desincronizar).
  commission_amount numeric(12,2)
    generated always as (round(cost * commission_pct / 100, 2)) stored,
  amount_paid       numeric(12,2) not null default 0,  -- cuánto cobró del paciente
  payment_method    payment_method,                    -- efectivo/qr/tarjeta/transf. (opcional)
  performed_at      date not null default current_date,
  notes             text,
  created_at        timestamptz not null default now()
);
create index idx_doctor_works_doctor on doctor_works(clinic_id, doctor_id, performed_at desc);

-- RLS. La tabla nace después del bloque masivo de 0002, así que se le aplica
-- el aislamiento por clínica a mano.
alter table doctor_works enable row level security;

create policy tenant_isolation on doctor_works
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- Cada doctor ve y gestiona SOLO sus propios trabajos; el admin ve los de todos.
create policy doctor_works_own on doctor_works as restrictive for all
  using ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()))
  with check ((select auth_role()) = 'admin' or doctor_id = (select auth.uid()));

-- ── Visibilidad de pacientes por doctor ─────────────────────────────────────
-- RESTRICTIVE => se suma con AND a la permisiva tenant_isolation existente.
-- Roles que NO son odontólogo (admin, recepción, asistente) no se ven afectados.
-- Un odontólogo ve al paciente si tiene una cita con él (match por nombre del
-- odontólogo, que la agenda guarda desde su perfil) o un trabajo registrado.
create policy patients_doctor_scope on patients as restrictive for select
  using (
    (select auth_role()) not in ('odontologo_general', 'especialista')
    or exists (
      select 1 from appointments a
      where a.patient_id = patients.id
        and a.dentist_name = (select full_name from profiles where id = (select auth.uid()))
    )
    or exists (
      select 1 from doctor_works w
      where w.patient_id = patients.id
        and w.doctor_id = (select auth.uid())
    )
  );
