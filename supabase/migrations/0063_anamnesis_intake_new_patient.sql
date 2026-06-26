-- 0063_anamnesis_intake_new_patient.sql — Auto-registro de pacientes nuevos
-- Extiende las invitaciones para registrar pacientes NUEVOS: la clínica solo
-- pone el celular, el paciente llena sus datos personales + historial, y al
-- aprobar se CREA el paciente. Las invitaciones de paciente existente siguen
-- igual (kind='existing').

alter table anamnesis_invitations
  -- patient_id pasa a ser opcional: una invitación de alta aún no tiene paciente.
  alter column patient_id drop not null;

alter table anamnesis_invitations
  add column if not exists kind text not null default 'existing'
    check (kind in ('existing', 'new')),
  -- Contacto que la clínica conoce al crear la invitación de alta.
  add column if not exists contact_phone text,
  add column if not exists contact_name  text,
  -- Datos personales que envía el paciente (solo en altas). Se aplican al crear.
  add column if not exists submitted_personal jsonb;

notify pgrst, 'reload schema';
