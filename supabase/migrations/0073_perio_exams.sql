-- 0073_perio_exams.sql — Periodontograma (addon premium "periodontograma")
-- Cada fila es un EXAMEN periodontal fechado (basal, reevaluación, mantenimiento).
-- Los exámenes se ACUMULAN: nunca se sobrescribe uno anterior, el valor clínico
-- está en comparar la evolución en el tiempo (¿mejoraron las bolsas?).
--
-- Las mediciones (6 sitios por diente: PS, recesión, sangrado, placa + movilidad
-- y furca por diente) viven en el jsonb `measurements`, mismo patrón que
-- odontograms.teeth. El NIC (nivel de inserción = PS + recesión) y los índices
-- (% sangrado, % placa, bolsa más profunda, etc.) se calculan en la app, no se
-- guardan (son derivados).

create table if not exists perio_exams (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  exam_date    date not null default current_date,
  author_id    uuid references profiles(id) on delete set null,
  author_name  text,
  measurements jsonb not null default '{}'::jsonb,
  diagnosis    text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists perio_exams_patient_idx
  on perio_exams (patient_id, exam_date desc);

-- Aislamiento por clínica: mismo patrón tenant_isolation que el resto de tablas
-- con clinic_id (helper auth_clinic_id() definido en 0002_rls.sql).
alter table perio_exams enable row level security;
create policy tenant_isolation on perio_exams
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
