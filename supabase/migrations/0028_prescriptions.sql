-- ============================================================================
-- 0028_prescriptions.sql — Tabla de prescripciones por paciente
-- ============================================================================
-- Prescripciones medicamentosas emitidas a pacientes.
-- Cada prescripción registra el doctor, fecha de emisión, y una lista de
-- medicamentos con dosis e instrucciones (almacenados en JSONB).
-- ============================================================================

create table prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  doctor_id   uuid references profiles(id) on delete set null,
  medications jsonb not null default '[]'::jsonb,
  -- Cada elemento del array: { name: string, dosage: string, instructions: string }
  notes       text,
  issued_at   timestamptz not null default now()
);

create index idx_prescriptions_patient on prescriptions(patient_id);
create index idx_prescriptions_clinic  on prescriptions(clinic_id);

-- RLS. La tabla nace después del bloque masivo de 0002, así que se le aplica
-- el aislamiento por clínica a mano.
alter table prescriptions enable row level security;

create policy tenant_isolation on prescriptions
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
