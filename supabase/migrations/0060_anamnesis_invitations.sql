-- 0060_anamnesis_invitations.sql — Formulario de historial para el paciente
-- La clínica genera un enlace tokenizado; el paciente lo abre SIN sesión,
-- llena su anamnesis y al enviar se guarda en patients.anamnesis_data.
-- El token es de un solo uso y expira. La escritura pública pasa por
-- service-role (server action que valida el token), por eso NO hay policy
-- de insert/update pública: RLS solo gobierna la lectura del staff.

create table if not exists anamnesis_invitations (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  patient_id   uuid not null references patients(id) on delete cascade,
  clinic_id    uuid not null references clinics(id) on delete cascade,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  completed_at timestamptz
);

create index if not exists anamnesis_invitations_patient_idx
  on anamnesis_invitations (patient_id);
create index if not exists anamnesis_invitations_token_idx
  on anamnesis_invitations (token);

alter table anamnesis_invitations enable row level security;

-- Lectura: el staff ve las invitaciones de su propia clínica (para mostrar
-- estado "pendiente / completado" en la ficha). El paciente nunca consulta
-- esta tabla con sesión: la validación del token la hace el server action
-- con service-role.
drop policy if exists anamnesis_invitations_select on anamnesis_invitations;
create policy anamnesis_invitations_select on anamnesis_invitations
  for select
  using (clinic_id = (select auth_clinic_id()));

-- Inserción: solo staff clínico de la misma clínica puede generar invitaciones.
drop policy if exists anamnesis_invitations_insert on anamnesis_invitations;
create policy anamnesis_invitations_insert on anamnesis_invitations
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in
      ('admin', 'odontologo_general', 'especialista', 'colega')
  );

notify pgrst, 'reload schema';
