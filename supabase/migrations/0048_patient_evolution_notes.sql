-- 0048_patient_evolution_notes.sql — Notas de evolución firmadas por autor
-- Cada nota la escribe un doctor o el admin; queda firmada con su nombre y SOLO
-- su autor puede editarla o borrarla (enforced por RLS, no solo en la app).
-- El campo libre patients.evolution se conserva como "nota histórica" de solo
-- lectura para no perder lo ya escrito.

create table if not exists patient_evolution_notes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists patient_evolution_notes_patient_idx
  on patient_evolution_notes (patient_id, created_at desc);

alter table patient_evolution_notes enable row level security;

-- Lectura: cualquier miembro de la clínica.
create policy evolution_select on patient_evolution_notes
  for select
  using (clinic_id = (select auth_clinic_id()));

-- Inserción: dentro de la clínica, firmando como uno mismo, y solo roles
-- clínicos con potestad de anotar evolución (admin + doctores; NO recepcionista).
create policy evolution_insert on patient_evolution_notes
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and author_id = (select auth.uid())
    and (select auth_role()) in ('admin', 'odontologo_general', 'especialista')
  );

-- Edición: solo el autor, dentro de su clínica.
create policy evolution_update on patient_evolution_notes
  for update
  using (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()))
  with check (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()));

-- Borrado: solo el autor.
create policy evolution_delete on patient_evolution_notes
  for delete
  using (clinic_id = (select auth_clinic_id()) and author_id = (select auth.uid()));
