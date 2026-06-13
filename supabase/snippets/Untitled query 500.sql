create table prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  doctor_id   uuid references profiles(id) on delete set null,
  medications jsonb not null default '[]'::jsonb,
  notes       text,
  issued_at   timestamptz not null default now()
);

create index idx_prescriptions_patient on prescriptions(patient_id);
create index idx_prescriptions_clinic  on prescriptions(clinic_id);

alter table prescriptions enable row level security;

create policy tenant_isolation on prescriptions
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
