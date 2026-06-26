-- Fotos clínicas del paciente. El BINARIO vive en Cloudflare R2 (storage barato,
-- egress gratis); esta tabla solo guarda la REFERENCIA (storage_key) + metadatos.
-- Nunca guardar la imagen dentro de la base: reventaría el límite de la DB.

create table if not exists patient_photos (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  storage_key text not null,   -- objeto en R2: {clinic_id}/{patient_id}/{uuid}.webp
  kind        text,            -- intraoral | radiografia | antes | despues | otro
  caption     text,
  width       int,
  height      int,
  size_bytes  int,
  taken_at    date,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists patient_photos_patient_idx
  on patient_photos (patient_id, created_at desc);

-- Aislamiento por clínica: mismo patrón tenant_isolation que el resto de tablas
-- con clinic_id (helper auth_clinic_id() definido en 0002_rls.sql).
alter table patient_photos enable row level security;
create policy tenant_isolation on patient_photos
  for all
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));
